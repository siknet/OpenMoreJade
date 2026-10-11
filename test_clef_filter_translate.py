"""
test_clef_filter_translate.py
=============================
使用 Cloudflare Clef-flash 决策模型对抓取条目进行前置评估与收录预测，
评估通过后再送入 LLM 执行高质量中文翻译与精选短评生成。

包含 5 个板块定制决策策略：
1. GitHub (repos)   : 黑马爆发力、技术深度、剔除简单 Demo / 玩具项目
2. Hugging Face (hf): 模型架构突破、开源权重重要性
3. Hacker News (news): 极客工程洞察、讨论含金量、剔除猎奇与水帖
4. Dev.to (devto)    : 真实架构实战、开源经验、剔除标题党与浅显入门文
5. Lobste.rs (lobsters): 系统工程硬核程度、重要版本发布
"""

import os
import json
import time
import requests

# ==========================================
# 1. 基础配置与环境探测
# ==========================================
ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "162bef2910ed559e2973ef3332e7f9bb")
CF_TOKEN = os.environ.get("CLOUDFLARE_AUTH_TOKEN")

# LLM 候选凭据探测 (支持 OpenAI, 阿里云 DashScope, Groq, 等)
OPENAI_KEY = os.environ.get("OPENAI_API_KEY")
DASHSCOPE_KEY = os.environ.get("DASHSCOPE_API_KEY")
GROQ_KEY = os.environ.get("Groq1_apikey") or os.environ.get("GROQ_API_KEY")

CF_BASE_URL = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run"
CLEF_MODEL_URL = f"{CF_BASE_URL}/@cf/cloudflare/clef-flash"

# ==========================================
# 2. 各板块专属的 Clef-flash 决策问答策略
# ==========================================
BOARD_POLICIES = {
    "repos": {
        "name": "GitHub 开源项目",
        "questions": {
            "worth_including": {
                "type": "choice",
                "instructions": "Is this repository innovative, practically valuable, and worth featuring on a daily tech radar?",
                "criteria": {
                    "yes": "High quality, novel tool, framework, library, or system with clear engineering value",
                    "no": "Trivial demo, student homework, copycat project, or pure marketing with little depth",
                },
            },
            "technical_depth": {
                "type": "score",
                "instructions": "Evaluate the technical depth of this project.",
                "criteria": [
                    "Surface-level / wrapper",
                    "Standard utility",
                    "Solid engineering",
                    "Significant breakthrough / foundational",
                ],
            },
            "category": {
                "type": "choice",
                "instructions": "What is the primary category?",
                "criteria": {
                    "tool": "CLI tools, developer utilities",
                    "model": "AI models, weights, fine-tunes",
                    "infra": "Runtimes, databases, distributed systems",
                    "framework": "Application frameworks, SDKs",
                },
            },
        },
    },
    "hf": {
        "name": "Hugging Face 模型趋势",
        "questions": {
            "worth_including": {
                "type": "choice",
                "instructions": "Is this model release significant and valuable for AI developers/researchers?",
                "criteria": {
                    "yes": "Notable base model, influential fine-tune, multimodal breakthrough, or useful adapter",
                    "no": "Undocumented experiment, trivial re-quant, spam upload, or test weights",
                },
            },
            "model_impact": {
                "type": "score",
                "instructions": "How impactful is this model release?",
                "criteria": [
                    "Negligible",
                    "Incremental / niche",
                    "Notable community tool",
                    "Major milestone / breakthrough",
                ],
            },
        },
    },
    "news": {
        "name": "Hacker News 科技热议",
        "questions": {
            "worth_including": {
                "type": "choice",
                "instructions": "Is this Hacker News discussion high-signal and insightful for technical builders?",
                "criteria": {
                    "yes": "Deep engineering reflection, post-mortem, tech breakthrough, or authentic Show HN",
                    "no": "Sensationalist headline, political drama, casual rant, or self-promotion",
                },
            },
            "depth": {
                "type": "score",
                "instructions": "Assess the technical insight of this topic.",
                "criteria": [
                    "Fluff / opinion piece",
                    "General tech news",
                    "Practical developer insight",
                    "Deep technical analysis",
                ],
            },
        },
    },
    "devto": {
        "name": "Dev.to 实战精选",
        "questions": {
            "worth_including": {
                "type": "choice",
                "instructions": "Does this article provide authentic engineering lessons or open source practice?",
                "criteria": {
                    "yes": "Substantial real-world architecture, debugging case study, or open source project walkthrough",
                    "no": "Generic 'Top 10 extensions' clickbait, trivial 5-line tutorial, or SEO spam",
                },
            },
            "rigor": {
                "type": "score",
                "instructions": "What is the practical engineering rigor of this article?",
                "criteria": [
                    "Beginner / superficial",
                    "Fair tutorial",
                    "Solid hands-on architecture",
                ],
            },
        },
    },
    "lobsters": {
        "name": "Lobste.rs 极客发布与探讨",
        "questions": {
            "worth_including": {
                "type": "choice",
                "instructions": "Is this Lobste.rs item an important release or serious computing topic?",
                "criteria": {
                    "yes": "Official framework/language release, systems engineering discussion, or serious computing topic",
                    "no": "Minor duplicate link, off-topic chat, or shallow commentary",
                },
            },
            "rigor": {
                "type": "score",
                "instructions": "Engineering significance of this post.",
                "criteria": [
                    "Minor note",
                    "Relevant framework update",
                    "Core systems milestone",
                ],
            },
        },
    },
}

# ==========================================
# 3. 测试条目样例集 (覆盖 5 个板块的好坏对照)
# ==========================================
SAMPLE_ITEMS = [
    # GitHub 好条目
    {
        "board": "repos",
        "id": "gh:vllm-project/vllm",
        "title": "vllm-project/vllm",
        "summary": "A high-throughput and memory-efficient LLM inference and serving engine with PagedAttention and speculative decoding.",
        "extra": "Lang: Python, Topics: llm, inference, paged-attention, vllm, gpu, pytorch",
    },
    # GitHub 水条目
    {
        "board": "repos",
        "id": "gh:random-dev/my-first-hello-world-llm",
        "title": "random-dev/my-first-hello-world-llm",
        "summary": "Simple test repository trying out langchain hello world with 3 lines of code.",
        "extra": "Lang: Python, Topics: test, demo",
    },
    # Hugging Face 好条目
    {
        "board": "hf",
        "id": "hf:Qwen/Qwen3.5-32B",
        "title": "Qwen/Qwen3.5-32B",
        "summary": "Next-generation 32B dense language model featuring native multimodal comprehension, long-context reasoning up to 128k, and improved coding capabilities.",
        "extra": "Tags: text-generation, causal-lm, qwen, transformers",
    },
    # Hacker News 好条目
    {
        "board": "news",
        "id": "hn:40128491",
        "title": "Show HN: Memory-efficient sparse matrix multiplication in pure WebAssembly",
        "summary": "We built a zero-dependency WebAssembly runtime that achieves 80% native BLAS speed for sparse graph operations in the browser without WebGPU.",
        "extra": "Domain: wasm-sparse.dev, Points: 312, Comments: 89",
    },
    # Hacker News 水条目
    {
        "board": "news",
        "id": "hn:40129999",
        "title": "Why you shouldn't use computers when drinking coffee",
        "summary": "A brief rant about someone who spilled latte on their keyboard and thinks laptops are poorly designed.",
        "extra": "Domain: personal-blog.net, Points: 12, Comments: 4",
    },
    # Dev.to 好条目
    {
        "board": "devto",
        "id": "devto:1928374",
        "title": "How We Scaled Our PostgreSQL Cluster to 50k QPS Using Logical Replication and pg_lakehouse",
        "summary": "Deep dive into our architectural migration from monolithic RDS to a hybrid OLTP/OLAP lakehouse setup with zero downtime lessons.",
        "extra": "Tags: postgres, database, architecture, devops",
    },
    # Dev.to 水条目
    {
        "board": "devto",
        "id": "devto:1928001",
        "title": "10 VSCode extensions that every junior coder MUST install right now!!",
        "summary": "Here is a list of extensions: prettier, eslint, bracket pair colorizer. Don't forget to like and comment!",
        "extra": "Tags: webdev, vscode, beginners",
    },
    # Lobste.rs 好条目
    {
        "board": "lobsters",
        "id": "lobsters:abc123z",
        "title": "Rust 1.85.0 released with async closures and 2024 edition stabilization",
        "summary": "The Rust team has officially stabilized the 2024 Edition, introducing async fn in traits enhancements, non-exhaustive enum matching, and Cargo resolver v3.",
        "extra": "Tags: release, rust, compilers",
    },
]

# ==========================================
# 4. Clef-flash 决策调用函数
# ==========================================
def evaluate_with_clef(item: dict) -> dict:
    """
    调用 Cloudflare Workers AI 的 Clef-flash 决策模型。
    如果未配置 CLOUDFLARE_AUTH_TOKEN，自动启用模拟规则并给出友好提示。
    """
    board = item["board"]
    policy = BOARD_POLICIES.get(board, BOARD_POLICIES["news"])

    state_text = f"Title: {item['title']}\nSummary: {item['summary']}\nContext: {item.get('extra', '')}"

    if not CF_TOKEN:
        # Mock 模式：展示如果调用 Clef-flash 返回的标准数据格式
        time.sleep(0.04)  # 模拟 ~40ms 极低延迟
        is_spam_candidate = "first-hello-world" in item["id"] or "drinking coffee" in item["title"] or "MUST install" in item["title"]
        return {
            "mode": "mock",
            "latency_ms": 38.5,
            "decision": {
                "worth_including": "no" if is_spam_candidate else "yes",
                "confidence": 0.94 if not is_spam_candidate else 0.97,
            },
            "input_tokens_est": len(state_text.split()) * 1.3 + 80,
        }

    headers = {
        "Authorization": f"Bearer {CF_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "clef-flash",
        "state": state_text,
        "questions": policy["questions"],
    }

    t0 = time.time()
    try:
        resp = requests.post(CLEF_MODEL_URL, headers=headers, json=payload, timeout=15)
        elapsed_ms = (time.time() - t0) * 1000
        if not resp.ok:
            raise RuntimeError(f"Clef API error HTTP {resp.status_code}: {resp.text}")
        data = resp.json().get("result", {})
        return {
            "mode": "live",
            "latency_ms": round(elapsed_ms, 1),
            "decision": data,
            "input_tokens_est": len(state_text.split()) * 1.3 + 80,
        }
    except Exception as e:
        return {
            "mode": "error",
            "error": str(e),
            "latency_ms": round((time.time() - t0) * 1000, 1),
            "decision": {"worth_including": "yes"},  # 降级放行
            "input_tokens_est": 150,
        }


# ==========================================
# 5. LLM 中文翻译与摘要生成 (决策通过后调用)
# ==========================================
def translate_and_enrich(item: dict) -> dict:
    """
    仅对 Clef-flash 预测收录的条目调用 Generative LLM 进行中文精译与短评提炼。
    """
    prompt = (
        f"请将以下技术资讯条目翻译并精炼为中文展示卡片：\n"
        f"标题: {item['title']}\n"
        f"简介: {item['summary']}\n\n"
        f"请返回 JSON 格式：\n"
        f'{{"title_zh": "自然流畅的技术中文标题", "blurb_zh": "80字以内的核心亮点解读", "why_it_matters": "为什么值得关注"}}'
    )

    # 尝试调用 OpenAI 兼容端点 (OpenAI 或 DashScope 或 Groq)
    api_key = OPENAI_KEY or DASHSCOPE_KEY or GROQ_KEY
    base_url = "https://api.openai.com/v1"
    model = "gpt-4o-mini"

    if DASHSCOPE_KEY and not OPENAI_KEY:
        base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
        model = "qwen-plus"
    elif GROQ_KEY and not OPENAI_KEY and not DASHSCOPE_KEY:
        base_url = "https://api.groq.com/openai/v1"
        model = "llama-3.1-8b-instant"

    if not api_key:
        # Mock LLM 返回
        time.sleep(0.15)
        return {
            "title_zh": f"【精选】{item['title'].split('/')[-1]}",
            "blurb_zh": f"该项目在 {item['board']} 展现出极高工程热度：{item['summary'][:40]}...",
            "why_it_matters": "具备重要的架构参考价值与社区前沿代表性。",
            "tokens_used": 180,
        }

    try:
        resp = requests.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.3,
                "response_format": {"type": "json_object"},
            },
            timeout=30,
        )
        if resp.ok:
            content = resp.json()["choices"][0]["message"]["content"]
            usage = resp.json().get("usage", {}).get("total_tokens", 220)
            parsed = json.loads(content)
            parsed["tokens_used"] = usage
            return parsed
    except Exception as e:
        pass

    return {
        "title_zh": f"{item['title']}",
        "blurb_zh": f"{item['summary'][:60]}...",
        "why_it_matters": "通过语义决策筛选出的重点条目。",
        "tokens_used": 120,
    }


# ==========================================
# 6. 主执行管道与测试对比统计
# ==========================================
def main():
    print("=" * 70)
    print("   AI-Resonance 决策模型 (Clef-flash) + LLM 翻译过滤对比测试")
    print("=" * 70)

    if not CF_TOKEN:
        print("[提示] 未检测到 CLOUDFLARE_AUTH_TOKEN 环境变量，已启用结构化 Mock 模式。")
        print("       若需测试 Cloudflare 实时接口，可在终端执行：")
        print('       $env:CLOUDFLARE_AUTH_TOKEN="你的Token"; python test_clef_filter_translate.py\n')
    else:
        print(f"[配置] 正在连接 Cloudflare Workers AI Account ID: {ACCOUNT_ID}\n")

    total_items = len(SAMPLE_ITEMS)
    accepted_count = 0
    filtered_count = 0
    total_clef_tokens = 0
    total_llm_tokens_saved = 0
    total_llm_tokens_spent = 0

    results = []

    for idx, item in enumerate(SAMPLE_ITEMS, 1):
        board = item["board"]
        policy_name = BOARD_POLICIES.get(board, {}).get("name", board)
        print(f"[{idx}/{total_items}] 正在评估 [{policy_name}] -> {item['title']}")

        # 步骤 1：Clef-flash 决策
        eval_res = evaluate_with_clef(item)
        decision = eval_res.get("decision", {})
        worth = decision.get("worth_including")

        # 解析回答（判断是否收录）
        is_worthwhile = False
        if isinstance(worth, dict):
            # Clef-flash 有时返回各选项概率字典，如 {"yes": 0.88, "no": 0.12}
            is_worthwhile = worth.get("yes", 0) > worth.get("no", 0)
        elif isinstance(worth, str):
            is_worthwhile = worth.lower() == "yes"

        tokens_est = eval_res.get("input_tokens_est", 120)
        total_clef_tokens += tokens_est

        if is_worthwhile:
            accepted_count += 1
            print(f"   ↳ 决策结果: [收录 PASS] (耗时 {eval_res.get('latency_ms')} ms) -> 送入 LLM 润色...")
            # 步骤 2：通过才送 LLM 润色
            enrich_res = translate_and_enrich(item)
            tokens_used = enrich_res.get("tokens_used", 200)
            total_llm_tokens_spent += tokens_used
            print(f"     [中文标题]: {enrich_res.get('title_zh')}")
            print(f"     [亮点速览]: {enrich_res.get('blurb_zh')}")
            print(f"     [关注价值]: {enrich_res.get('why_it_matters')}\n")
        else:
            filtered_count += 1
            saved = 200  # 平均一次常规 LLM 润色消耗 ~200 Tokens
            total_llm_tokens_saved += saved
            print(f"   ↳ 决策结果: [跳过 SKIP] 低信噪比/水文 (耗时 {eval_res.get('latency_ms')} ms) -> 节省 1 次 LLM 请求 (~{saved} Tokens)\n")

    # ==========================================
    # 7. 统计与 Cloudflare 免费配额测算报表
    # ==========================================
    # Clef-flash 计费标准：8,182 Neurons / 1M Input Tokens
    neurons_consumed = (total_clef_tokens / 1_000_000) * 8182
    daily_free_neurons = 10000

    print("=" * 70)
    print("                    测试结论与配额测算报告")
    print("=" * 70)
    print(f"1. 评估总样本量        : {total_items} 条")
    print(f"   - 决策收录通过      : {accepted_count} 条")
    print(f"   - 决策过滤淘汰      : {filtered_count} 条")
    print(f"   - 过滤剪枝率 (Pruning): {filtered_count / total_items * 100:.1f} % (LLM 调用频率直接降低！)")
    print()
    print(f"2. LLM (Groq/Ollama) 节省指标:")
    print(f"   - 实际调用 LLM 次数 : {accepted_count} 次")
    print(f"   - 节省的 LLM 调用   : {filtered_count} 次")
    print(f"   - 节省的 LLM Tokens : ~{total_llm_tokens_saved} Tokens (有效规避 Groq 429 限流)")
    print()
    print(f"3. Cloudflare Clef-flash 消耗与免费额度:")
    print(f"   - Clef 消耗 Input Token: ~{int(total_clef_tokens)} Tokens")
    print(f"   - 折算 Cloudflare 算力 : {neurons_consumed:.3f} Neurons")
    print(f"   - CF 每日免费额度      : {daily_free_neurons} Neurons")
    print(f"   - 占 CF 每日免费配额   : {neurons_consumed / daily_free_neurons * 100:.4f} % (几乎零感知消耗)")
    print(f"   - 每日免费额度可支持   : 约 {int(daily_free_neurons / (neurons_consumed / total_items)):,} 条条目全量评估")
    print("=" * 70)

if __name__ == "__main__":
    main()
