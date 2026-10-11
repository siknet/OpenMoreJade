import os
import json
import requests

# =========================
# Cloudflare 配置
# =========================

ACCOUNT_ID = "162bef2910ed559e2973ef3332e7f9bb"
AUTH_TOKEN = os.environ.get("CLOUDFLARE_AUTH_TOKEN")

if not AUTH_TOKEN:
    raise RuntimeError(
        "没有找到 CLOUDFLARE_AUTH_TOKEN 环境变量。\n"
        "PowerShell 示例：\n"
        '$env:CLOUDFLARE_AUTH_TOKEN="你的Cloudflare API Token"'
    )

BASE_URL = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run"


HEADERS = {
    "Authorization": f"Bearer {AUTH_TOKEN}",
    "Content-Type": "application/json",
}


# =========================
# 1. 测试 Qwen3-Embedding-0.6B
# =========================

def test_embedding():
    print("\n" + "=" * 60)
    print("测试 Qwen3-Embedding-0.6B")
    print("=" * 60)

    stories = [
        "This is a story about an orange cloud.",
        "This is a story about a red cloud.",
        "This is a story about a llama.",
        "This is a story about artificial intelligence.",
    ]

    url = f"{BASE_URL}/@cf/qwen/qwen3-embedding-0.6b"

    try:
        response = requests.post(
            url,
            headers=HEADERS,
            json={
                "text": stories
            },
            timeout=60,
        )

        print("HTTP Status:", response.status_code)

        data = response.json()

        if not response.ok:
            print("请求失败：")
            print(json.dumps(data, indent=2, ensure_ascii=False))
            return

        print("请求成功！")
        print("success:", data.get("success"))

        result = data.get("result", {})

        # 打印返回结构
        print("\n返回字段：")
        print(list(result.keys()))

        embeddings = result.get("data")

        if embeddings is None:
            print("\n完整返回：")
            print(json.dumps(data, indent=2, ensure_ascii=False))
            return

        print("\nEmbedding 数量:", len(embeddings))

        if embeddings:
            print("第一个 Embedding 维度:", len(embeddings[0]))

            print("\n第一个向量前 10 个值：")
            print(embeddings[0][:10])

        print("\nQwen Embedding 测试完成。")

    except Exception as e:
        print("请求异常：", repr(e))


# =========================
# 2. 测试 Clef-flash
# =========================

def test_clef():
    print("\n" + "=" * 60)
    print("测试 Clef-flash")
    print("=" * 60)

    url = f"{BASE_URL}/@cf/cloudflare/clef-flash"

    payload = {
        "model": "clef-flash",

        "state": (
            "Checkout has been failing for every customer for the last hour. "
            "Customers cannot complete their purchases."
        ),

        "questions": {
            "urgent": {
                "type": "noul",
                "instructions": "Is this support request urgent?",
            },

            "team": {
                "type": "choice",
                "instructions": "Which team should handle this request?",
                "criteria": {
                    "billing": "Payments, invoices, and refunds",
                    "technical": "Outages, errors, and configuration",
                    "sales": "Plans and upgrades",
                },
            },

            "severity": {
                "type": "score",
                "instructions": "How severe is the customer impact?",
                "criteria": [
                    "No impact",
                    "Minor",
                    "Major",
                    "Critical",
                ],
            },
        },
    }

    try:
        response = requests.post(
            url,
            headers=HEADERS,
            json=payload,
            timeout=60,
        )

        print("HTTP Status:", response.status_code)

        data = response.json()

        if not response.ok:
            print("请求失败：")
            print(json.dumps(data, indent=2, ensure_ascii=False))
            return

        print("请求成功！")

        print("\n完整返回结果：")
        print(json.dumps(data, indent=2, ensure_ascii=False))

    except Exception as e:
        print("请求异常：", repr(e))


# =========================
# Main
# =========================

if __name__ == "__main__":

    print("Cloudflare Workers AI 模型测试")
    print("Account ID:", ACCOUNT_ID)

    test_embedding()
    test_clef()

    print("\n" + "=" * 60)
    print("全部测试完成")
    print("=" * 60)