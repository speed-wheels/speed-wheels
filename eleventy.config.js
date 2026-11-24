import Image from "@11ty/eleventy-img";
import path from "node:path";

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/admin": "admin" });
  eleventyConfig.ignores.add("src/admin/**");
  eleventyConfig.addPassthroughCopy({ "src/_headers": "_headers" });
  eleventyConfig.addPassthroughCopy({ "src/images/products": "images/products" }); // originals, used by schema/OG

  eleventyConfig.addCollection("products", (api) =>
    api.getFilteredByGlob("src/products/*.md").sort((a, b) => (a.data.order ?? 99) - (b.data.order ?? 99))
  );

  eleventyConfig.addCollection("shopCollections", (api) =>
    api.getFilteredByGlob("src/collections/*.md").sort((a, b) => (a.data.order ?? 99) - (b.data.order ?? 99))
  );

  // ₹1,499 style price
  eleventyConfig.addFilter("inr", (n) => "₹" + Number(n).toLocaleString("en-IN"));
  eleventyConfig.addFilter("absUrl", (p, base) => new URL(p, base).href);
  eleventyConfig.addFilter("json", (v) => JSON.stringify(v));
  eleventyConfig.addFilter("isoDate", (d) => new Date(d).toISOString().slice(0, 10));
  eleventyConfig.addFilter("discount", (price, mrp) => (mrp && mrp > price ? Math.round((1 - price / mrp) * 100) : 0));

  eleventyConfig.addFilter("head", (a, n) => (a || []).slice(0, n));
  eleventyConfig.addFilter("featured", (a) => a.filter((p) => p.data.featured));
  eleventyConfig.addFilter("except", (a, url) => a.filter((p) => p.url !== url));
  eleventyConfig.addFilter("inCollection", (a, slug) => a.filter((p) => p.data.collection === slug));
  eleventyConfig.addFilter("findBySlug", (a, slug) => (a || []).find((c) => c.fileSlug === slug));
  eleventyConfig.addFilter("year", () => new Date().getFullYear());

  // Responsive WebP images from any uploaded photo (jpg/png/webp)
  eleventyConfig.addAsyncShortcode("img", async (src, alt, sizes = "100vw", cls = "", eager = false) => {
    const file = path.join("src", src.replace(/^\//, ""));
    const meta = await Image(file, {
      widths: [400, 800, 1200],
      formats: ["webp", "jpeg"],
      outputDir: "_site/img/",
      urlPath: "/img/",
    });
    return Image.generateHTML(meta, {
      alt, sizes, class: cls,
      loading: eager ? "eager" : "lazy",
      decoding: "async",
      ...(eager ? { fetchpriority: "high" } : {}),
    });
  });

  return { dir: { input: "src", output: "_site" }, markdownTemplateEngine: "njk", htmlTemplateEngine: "njk" };
}
