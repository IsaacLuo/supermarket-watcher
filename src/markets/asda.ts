import puppeteer from "puppeteer";
import mariadb from "mariadb";
import { calcMultibuyPrice, checkRecord, saveRecord } from "../libs";

export async function asda(browser: puppeteer.Browser, productName: string, url: string, conn: mariadb.Connection) {
  
  const market = "asda";

  const page = (await browser.pages())[0];
  
  page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Safari/537.36")
  page.setDefaultNavigationTimeout(60000);
  await page.goto(url);

  await page.waitForSelector(".pdp-main-details__price-container strong.co-product__price");
    
  // price tag
  const priceTextValue = (await page.$eval(".pdp-main-details__price-container strong.co-product__price", div => div.textContent))
  if (!priceTextValue) {
    throw new Error("unable to locate pricetag")
  }
  const priceValueStrs = /\d+\.\d+/.exec(priceTextValue);
  let price = priceValueStrs?.[0];
  if (!price) {
    throw new Error("unable to locate pricetag")
  }
  
  const promoText = (await page.$eval("div.pdp-main-details__promo-cntr span.co-product__promo-text", div => div.textContent).catch(() => "")) || "";
  const multibuyPrice = await calcMultibuyPrice(promoText)

  // check pictureUrl

  const photo = (await page.$eval(".product-detail-page__zoomed-image--selected picture.asda-image img.asda-image-zoom__small-image", div => div.getAttribute("src")).catch(() => "")) || "";

  // check if there is the same price tag already
  const existingProduct = await checkRecord(conn, market, productName, price, multibuyPrice, promoText);
  if (existingProduct) return {...existingProduct, photo};

  // save record
  return { ...await saveRecord(conn, market, productName, price, multibuyPrice, promoText), photo };
}