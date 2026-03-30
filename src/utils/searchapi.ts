import * as cheerio from "cheerio";

type SearchResult = 
{
  title: string;
  url: string;
};

function extractRealUrl(href: string): string | null 
{
  try {
    const url = new URL(href, "https://duckduckgo.com");

    const uddg = url.searchParams.get("uddg");

    if (uddg) {
      return decodeURIComponent(uddg);
    }

    return href;
  } catch {
    return null;
  }
}

function deduplicate(results: SearchResult[]): SearchResult[] 
{
  const seen = new Set<string>();

  return results.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

export async function searchAPI(query: string): Promise<SearchResult[]> 
{
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
  });

  const html = await res.text();

  const $ = cheerio.load(html);

  const results: SearchResult[] = [];

  $(".result").each((_, el) => {
    const link = $(el).find(".result__a");
    const title = link.text().trim();
    let href = link.attr("href");

    if (!href) return;

    // DuckDuckGo redirect URL → valódi URL
    const realUrl = extractRealUrl(href);

    if (!realUrl) return;

    results.push({
      title,
      url: realUrl
    });
  });

  return deduplicate(results).slice(0, 5);
}