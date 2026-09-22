import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const home = read("apps/web/index.html");
const styles = read("apps/web/home-redesign.css");
const carousel = read("apps/web/home-carousel.js");

const slideAssets = [
  ["home-slider-po-wo.png", "hero-slide--orders"],
  ["home-slider-ai-agent.png", "hero-slide--ai"],
  ["home-slider-payments.png", "hero-slide--payments"],
];
const selectorAssets = [
  "home-selector-workspace.png",
  "home-selector-po-wo.png",
  "home-selector-ai-agent.png",
  "home-selector-payments.png",
];

test("approved local assets exist and are non-empty", () => {
  for (const asset of [...slideAssets.map(([name]) => name), ...selectorAssets]) {
    const url = new URL(`../apps/web/assets/${asset}`, import.meta.url);
    assert.equal(existsSync(url), true, `missing ${asset}`);
    assert.ok(statSync(url).size > 100_000, `${asset} is unexpectedly small`);
  }
});

test("Slides 2 through 4 use the approved image mapping while Workspace keeps its existing hero", () => {
  assert.match(styles, /url\("\.\/assets\/home-hero-v2\.png"\)/);
  for (const [asset, slideClass] of slideAssets) {
    const slide = home.match(new RegExp(`<article class="hero-slide ${slideClass}"[\\s\\S]*?<\\/article>`))?.[0] || "";
    assert.ok(slide.includes(`./assets/${asset}`), `${slideClass} does not use ${asset}`);
  }
});

test("four selector cards map in order to the four approved previews", () => {
  const cards = [...home.matchAll(/<button class="carousel-selector[^>]*data-carousel-select="(\d)"[\s\S]*?<\/button>/g)];
  assert.equal(cards.length, 4);
  cards.forEach((card, index) => {
    assert.equal(Number(card[1]), index);
    assert.ok(card[0].includes(`./assets/${selectorAssets[index]}`));
  });
});

test("duplicate semantic capability strip and obsolete HTML hero compositions are removed", () => {
  assert.doesNotMatch(home, /class="capability-strip"/);
  assert.doesNotMatch(home, /class="capability capability--/);
  assert.doesNotMatch(home, /product-composition|ai-assistant-illustration|payment-phone/);
});

test("accessible carousel behavior remains intact", () => {
  assert.equal((home.match(/\bdata-carousel-slide\b/g) || []).length, 4);
  assert.equal((home.match(/\bdata-carousel-dot="/g) || []).length, 4);
  assert.match(home, /carousel-arrow--previous/);
  assert.match(home, /carousel-arrow--next/);
  assert.doesNotMatch(home, /class="carousel-status"/);
  assert.match(carousel, /6000/);
  assert.match(carousel, /dots\.forEach/);
  assert.match(carousel, /ArrowLeft/);
  assert.match(carousel, /prefers-reduced-motion: reduce/);
  assert.match(carousel, /pointerdown/);
});

test("image sizing is explicit and responsive without remote dependencies", () => {
  assert.equal((home.match(/class="hero-slide-image"[^>]+width="1672" height="941"/g) || []).length, 3);
  assert.equal((home.match(/class="selector-visual"[\s\S]*?<img[^>]+width="1254" height="1254"/g) || []).length, 4);
  assert.match(styles, /\.hero-slide-image[\s\S]*?object-fit: cover/);
  assert.match(styles, /\.selector-visual img[\s\S]*?object-fit: contain/);
  assert.doesNotMatch(home, /<(?:img|source)\b[^>]+(?:src|srcset)="https?:\/\//i);
});
