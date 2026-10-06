/**
 * RSS 2.0, Atom and RDF feed parsing shared by labs and feeds.
 */
import { clip, isoDate, plain } from './util.ts'
import { asArray, attrOf, childOf, parseXml, textOf, type XmlNode } from './xml.ts'

const MAX_AUTHORS = 20
const DOI = /\b10\.\d{4,9}\/[^\s?#"<>]+/

export interface FeedEntry {
  title: string
  link: string
  text: string
  date?: string
  doi?: string
  pdf?: string
  authors: string[]
  categories: string[]
}

type Element = Exclude<XmlNode, string>

function linkOf(item: Element): string {
  const links = asArray(item.link)
  const atom = links.find((l) => typeof l === 'object' && ['', 'alternate'].includes(attrOf(l, 'rel')))
  return (atom ? attrOf(atom, 'href') : textOf(links[0])).trim() || attrOf(item, 'rdf:about')
}

function authorsOf(item: Element): string[] {
  const nodes = [...asArray(item['dc:creator']), ...asArray(item.author)]
  return nodes
    .flatMap((node) => (typeof node === 'object' && node.name ? [textOf(node.name)] : textOf(node).split(/,\s+|;\s*/)))
    .map(plain)
    .filter(Boolean)
    .slice(0, MAX_AUTHORS)
}

function entryOf(item: XmlNode): FeedEntry | null {
  if (typeof item !== 'object') return null
  const link = linkOf(item)
  const title = plain(textOf(item.title))
  if (!link || !title) return null
  const text = [item.description, item.summary, item['content:encoded'], item.content].map((n) => plain(textOf(n)))
  const identifier = [item['prism:doi'], item['dc:identifier']].map((n) => textOf(n)).join(' ')
  return {
    title,
    link,
    text: text.find(Boolean) ?? '',
    date: [item['dc:date'], item.pubDate, item.published, item.updated].map((n) => isoDate(textOf(n))).find(Boolean),
    doi: (DOI.exec(identifier) ?? DOI.exec(link))?.[0].toLowerCase(),
    pdf: textOf(item.pdf).trim() || undefined,
    authors: authorsOf(item),
    categories: asArray(item.category)
      .map((c) => plain(attrOf(c, 'term') || textOf(c)))
      .filter(Boolean),
  }
}

/** Items of an RSS 2.0, Atom or RDF document, in feed order. */
export function parseFeed(xml: string): FeedEntry[] {
  const doc = parseXml(xml)
  if (!doc.rss && !doc['rdf:RDF'] && !doc.feed) throw new Error('not an RSS, Atom or RDF feed')
  const rss = childOf(childOf(doc.rss, 'channel'), 'item')
  return asArray(rss ?? childOf(doc['rdf:RDF'], 'item') ?? childOf(doc.feed, 'entry'))
    .map(entryOf)
    .filter((entry) => entry !== null)
}
