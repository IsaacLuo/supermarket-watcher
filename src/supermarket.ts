import toml from "toml";
import * as csv from "fast-csv";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import mariadb from "mariadb";
import { asda } from "./markets/asda";
import { tesco } from "./markets/tesco";
import { clearPriceTag, MarketUrls, ProductQueryRow, ProductReportRow, savePriceTag, saveProductInformation } from "./libs";



export async function scanProduct(product:ProductQueryRow, browser:puppeteer.Browser, conn:mariadb.PoolConnection) {
  if (product.skip.trim() !== '') {
    return;
  }
  const productName = product.name;
  console.log(productName)

  const maketAnalysers = {
    asda,
    tesco,
  }

  const markets = Object.keys(maketAnalysers);

  const priceTag: ProductReportRow = {
    group: product.group,
    name: product.name,
    quantity: product.quantity,
    volume: product.volume,
    weight: product.weight
  }

  let photoUrl = "";
  for (const market of markets) {
    if (maketAnalysers[market as keyof typeof maketAnalysers] && product[market as keyof MarketUrls]) {
      try {
        // call market function
        const { price, multibuyPrice, comment, photo } = await maketAnalysers[market as keyof typeof maketAnalysers](
          browser, productName, product[market as keyof MarketUrls], conn
        )
        console.log(market, price, comment && `(${comment})`);
        if (!photoUrl) {
          photoUrl = photo;
        }
        (priceTag as any)[market as keyof typeof priceTag] = price;
        (priceTag as any)[`${market}MultibuyPrice` as keyof typeof priceTag] = multibuyPrice;
        (priceTag as any)[`${market}Comment` as keyof typeof priceTag] = comment;
      } catch (error) {
        console.error(error);
        console.log(`unable to read price of ${productName} in ${market}`);
      }
    }
  }
  await saveProductInformation(conn, {
    group: priceTag.group,
    name: priceTag.name,
    quantity: priceTag.quantity,
    volume: priceTag.volume,
    weight: priceTag.weight,
    photo: photoUrl,
  })
  await savePriceTag(conn, { ...priceTag, photo:photoUrl, asdaUrl: product.asda, tescoUrl:product.tesco});

  console.log("\n");


  return priceTag;
}

export async function scan() {
  try {

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

    const { mariaDbInfo } = toml.parse(await fs.readFileSync("conf/conf.toml", { encoding: "utf-8" }));
    const pool = mariadb.createPool(mariaDbInfo);

    const conn = await pool.getConnection();

    const csvLogFileStream = fs.createWriteStream(`logs/${new Date().toISOString().replace(":","_")}.csv`,{encoding:"utf-8"});
    const csvLogStream = csv.format({ headers: true });
    csvLogStream.pipe(csvLogFileStream).on('end', () => csvLogFileStream.close());

    const parsedRows = await new Promise((resolve:(rows:ProductQueryRow[])=>void) => {
      const rows:ProductQueryRow[] = [];
      fs.createReadStream(path.resolve("datasource/products.csv"))
        .pipe(csv.parse({ headers: true }))
        .on('error', error => console.error(error))
        .on('data', row => rows.push(row))
        .on('end', (rowCount: number) => resolve(rows))
    });
    await clearPriceTag(conn);
    for (const row of parsedRows) {
      const productPriceTag = await scanProduct(row, browser, conn);
      if (productPriceTag) {
        csvLogStream.write(productPriceTag);
      }
    }
    csvLogStream.end();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
  
}

// scan();