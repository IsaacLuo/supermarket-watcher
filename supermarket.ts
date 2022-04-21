import toml from "toml";
import fs from "fs";
import puppeteer from "puppeteer";
import { exit } from "process";
import mariadb from "mariadb";

export async function scan() {
  const sitesFile = await fs.readFileSync("products.toml", {encoding:"utf-8"});
  const products = toml.parse(sitesFile);

  const browser = await puppeteer.launch({
    // headless: false, // default is true
    headless: true,
    // executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ignoreDefaultArgs: ["--enable-automation"],
    userDataDir: "./user_data",
    defaultViewport: null,
    // devtools: true,
    ignoreHTTPSErrors: true,
  });

  const maketAnalysers = {
    asda:asda,
  }

  const { mariaDbInfo } = toml.parse(await fs.readFileSync("conf.toml", {encoding:"utf-8"}));
  const pool = mariadb.createPool(mariaDbInfo);

  const conn = await pool.getConnection();

  for (const productName in products) {
    console.log(productName)
    const urls = products[productName];
    for (const market in urls) {
      if (maketAnalysers[market as keyof typeof maketAnalysers]) {
        const { price, comment } = await maketAnalysers[market as keyof typeof maketAnalysers](browser, productName, urls[market as keyof typeof urls], conn)
        console.log(market, price, comment&&`(${comment})`);
      }
    }
    console.log("\n")
  }
  process.exit(0);
}

async function asda(browser: puppeteer.Browser, productName: string, url: string, conn: mariadb.Connection) {
  
  const market = "asda";

  const page = (await browser.pages())[0];
  // const page = await browser.newPage();
  page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Safari/537.36")
  page.setDefaultNavigationTimeout(60000);
  await page.goto(url);

  await page.waitForSelector(".pdp-main-details__price-container strong.co-product__price");
  // await page.waitForTimeout(3000);
  
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
  
  const promoText = (await page.$eval("div.pdp-main-details__promo-cntr span.co-product__promo-text", div => div.textContent).catch(()=>""))

  // check if there is the same price tag already
  const existingProduct = await conn.query("SELECT * FROM raw_price_record WHERE market = ? AND product_name = ? ORDER BY timestamp DESC LIMIT 1", [market, productName])
  if (existingProduct.length > 0) {
    const { timestamp, price: oldPrice, comment: oldComment } = existingProduct[0];
    if (timestamp && Date.now() - timestamp < 24 * 3600 * 1000 && price === oldPrice && promoText === oldComment) {
      // no need to update
      return {market, productName, price, comment:promoText };
    }
  }

  // save record
  const res = await conn.query(
    "INSERT INTO raw_price_record (market, product_name, price, comment) value (?, ?, ?, ?)",
    [market, productName, price, promoText]
  );
  if (res.affectedRows === 1) { // { affectedRows: 1, insertId: 1, warningStatus: 0 }
    console.log('inserted record')
    return {market, productName, price, comment:promoText };
  } else {
    console.error(res);
    throw new Error("unable save result to database");
  }
}

scan().then(() => {
  console.log('done');
  exit(0);
});