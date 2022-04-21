import toml from "toml";
import fs from "fs";
import puppeteer from "puppeteer";
import { exit } from "process";
import mariadb from "mariadb";

export async function scan() {
  try {
    const sitesFile = await fs.readFileSync("products.toml", { encoding: "utf-8" });
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
      asda,
      tesco,
    }

    const { mariaDbInfo } = toml.parse(await fs.readFileSync("conf.toml", { encoding: "utf-8" }));
    const pool = mariadb.createPool(mariaDbInfo);

    const conn = await pool.getConnection();

    for (const productName in products) {
      console.log(productName)
      const urls = products[productName];
      for (const market in urls) {
        if (maketAnalysers[market as keyof typeof maketAnalysers]) {
          const { price, comment } = await maketAnalysers[market as keyof typeof maketAnalysers](browser, productName, urls[market as keyof typeof urls], conn)
          console.log(market, price, comment && `(${comment})`);
        }
      }
      console.log("\n")
    }
    process.exit(0);
  } catch {
    process.exit(1);
  }
  
}

async function checkRecord(conn: mariadb.Connection, market: string, productName: string, price: string, multibuyPrice: string | null, comment: string) {
  const existingProduct = await conn.query("SELECT * FROM raw_price_record WHERE market = ? AND product_name = ? ORDER BY timestamp DESC LIMIT 1", [market, productName])
  if (existingProduct.length > 0) {
    const { timestamp, price: oldPrice, comment: oldComment, multibuy_price:oldMultibuyPrice } = existingProduct[0];
    if (timestamp && Date.now() - timestamp < 24 * 3600 * 1000 && price === oldPrice && comment === oldComment && (multibuyPrice === oldMultibuyPrice )) {
      // no need to update
      return {market, productName, price, multibuyPrice, comment };
    } else {
      console.log({market, productName, price, multibuyPrice, comment }, {oldPrice, oldComment, oldMultibuyPrice})
    }
  }
}

async function saveRecord(conn:mariadb.Connection, market:string, productName:string, price:string, multibuyPrice: string|null, comment:string) {
  const res = await conn.query(
    "INSERT INTO raw_price_record (market, product_name, price, multibuy_price, comment) value (?, ?, ?, ?, ?)",
    [market, productName, price, multibuyPrice, comment]
  );
  if (res.affectedRows === 1) { // { affectedRows: 1, insertId: 1, warningStatus: 0 }
    console.log('inserted record')
    return {market, productName, price, comment };
  } else {
    console.error(res);
    throw new Error("unable save result to database");
  }
}

async function calcMultibuyPrice(promoText: string) {
  try {
    const regxResult = /(\d+) for £(\d+(.\d+)?)/.exec(promoText);
    if (!regxResult) {
      return null;
    }
    const num = regxResult?.[1];
    const total = regxResult?.[2];
    let price = (parseFloat(total!) / parseInt(num!))
    if (Number.isNaN(price)) {
      console.warn(`${promoText} is not readable`)
      return null;
    } else {
      return price.toFixed(2);
    }
  } catch {
    return null;
  }
}

async function asda(browser: puppeteer.Browser, productName: string, url: string, conn: mariadb.Connection) {
  
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

  // check if there is the same price tag already
  const existingProduct = await checkRecord(conn, market, productName, price, multibuyPrice, promoText);
  if (existingProduct) return existingProduct;

  // save record
  return await saveRecord(conn, market, productName, price,multibuyPrice,  promoText);
}

async function tesco(browser: puppeteer.Browser, productName: string, url: string, conn: mariadb.Connection) {
  
  const market = "tesco";

  const page = (await browser.pages())[0];
  page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Safari/537.36")
  page.setDefaultNavigationTimeout(60000);
  await page.goto(url);

  await page.waitForSelector("div.price-control-wrapper span.value");
  
  // price tag
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

  // check if there is the same price tag already
  const existingProduct = await checkRecord(conn, market, productName, price, multibuyPrice, promoText);
  if (existingProduct) return existingProduct;

  // save record
  return await saveRecord(conn, market, productName, price, multibuyPrice, promoText);
}

scan();