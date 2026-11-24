// Public catalog used by the cart/checkout pages AND by the server to price orders.
import Image from "@11ty/eleventy-img";
import path from "node:path";

export const data = { permalink: "/catalog.json", eleventyExcludeFromCollections: true };

export async function render(data) {
  const products = await Promise.all(
    data.collections.products.map(async (p) => {
      let thumb = p.data.image;
      try {
        const meta = await Image(path.join("src", p.data.image.replace(/^\//, "")), {
          widths: [400, 800, 1200], formats: ["webp", "jpeg"], outputDir: "_site/img/", urlPath: "/img/",
        });
        thumb = meta.webp[0].url;
      } catch {}
      return {
        id: p.fileSlug, title: p.data.title, price: Number(p.data.price), mrp: Number(p.data.mrp || 0) || null,
        inStock: p.data.inStock !== false, colours: p.data.colours || [], collection: p.data.collection || "",
        url: p.url, image: thumb, brand: p.data.brand || "", summary: p.data.summary || "",
        collectionTitle: (data.collections.shopCollections.find((c) => c.fileSlug === p.data.collection) || { data: {} }).data.title || "",
        order: p.data.order ?? 99, featured: !!p.data.featured,
      };
    })
  );
  const cols = data.collections.shopCollections.map((c) => ({ slug: c.fileSlug, title: c.data.title, url: c.url }));
  return JSON.stringify({ products, collections: cols, shipping: data.shipping, generated: new Date().toISOString() });
}
