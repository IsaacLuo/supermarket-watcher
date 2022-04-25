import puppeteer from "puppeteer";
import mariadb from "mariadb";
import { calcMultibuyPrice, checkRecord, saveRecord } from "../libs";

export async function tesco(browser: puppeteer.Browser, productName: string, url: string, conn: mariadb.Connection) {
  
  const market = "tesco";

  const page = (await browser.pages())[0];
  page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Safari/537.36")
  page.setDefaultNavigationTimeout(60000);
  await page.goto(url);

  await page.waitForSelector("div.footer__copyright");
  
  // price tag
  try {
    const productInfo = (await page.$eval("div.product-info-message", div => div.textContent));
    if (productInfo === "Sorry, this product is currently unavailable") {
      throw new Error("Sorry, this product is currently unavailable");
    }
  }catch{
    
  }
  const priceTextValue = (await page.$eval("div.price-control-wrapper span.value", div => div.textContent))
  if (!priceTextValue) {
    throw new Error("unable to locate pricetag")
  }
  const priceValueStrs = /\d+\.\d+/.exec(priceTextValue);
  let price = priceValueStrs?.[0];
  if (!price) {
    throw new Error("unable to locate pricetag")
  }
  
  let promoText = (await page.$eval(".product-promotion span.offer-text", div => div.textContent).catch(() => "")) || "";
  
  const clubCardPrice = /£(\d+.\d+) Clubcard Price/.exec(promoText!)?.[1];
  if (clubCardPrice) {
    price = clubCardPrice;
  }

  const multibuyPriceStr = /(\d+ for £\d+(.\d+)?) Clubcard Price/.exec(promoText!)?.[1];
  let multibuyPrice = null;
  if (multibuyPriceStr) {
    promoText = multibuyPriceStr;
    multibuyPrice = await calcMultibuyPrice(multibuyPriceStr)
  }

  // get photo url
  const photo = (await page.$eval(".product-image--wrapper > span > div > div > img", div => div.getAttribute("src")).catch(() => "")) || "";
  
  
  // check if there is the same price tag already
  const existingProduct = await checkRecord(conn, market, productName, price, multibuyPrice, promoText);
  if (existingProduct) return {...existingProduct, photo};

  // save record
  return { ...await saveRecord(conn, market, productName, price, multibuyPrice, promoText), photo };
}