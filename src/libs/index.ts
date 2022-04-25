import mariadb from "mariadb";


export interface ProductInfo {
  group?: string;
  name?: string;
  quantity?: number;
  volume?: number;
  weight?: number;
  photo?: string;
}

export interface MarketUrls {
  asda: string;
  tesco: string;
}

export interface ProductQueryRow extends MarketUrls {
  skip: string;
  group: string;
  name: string;
  quantity: number;
  volume: number;
  weight: number;
}

export interface ProductReportRow {
  group?: string;
  name?: string;
  quantity?: number;
  volume?: number;
  weight?: number;
  asda?: string;
  asdaMultibuyPrice?: string;
  asdaComment?: string;
  tesco?: string;
  tescoMultibuyPrice?: string;
  tescoComment?: string;
}

export interface ProductReportDbRow extends ProductReportRow{
  asdaUrl?: string;
  tescoUrl?: string;
  photo?: string;
}

export async function checkRecord(conn: mariadb.Connection, market: string, productName: string, price: string, multibuyPrice: string | null, comment: string) {
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


export async function saveProductInformation(conn: mariadb.Connection, productInfo: ProductInfo) { 
  const res = await conn.query(
    "SELECT * FROM products WHERE name = ?",
    [productInfo.name]
  );
  if (res[0]) {
    const product = res[0];
    if (
      product.product_group !== productInfo.group ||
      product.quantity !== productInfo.quantity ||
      product.weight !== productInfo.weight ||
      product.volume !== productInfo.volume ||
      product.photo !== productInfo.photo
    ) {
      await conn.query(
        "UPDATE products SET product_group=?, quantity=?, weight=?, volume=?, photo=?",
        [productInfo.group||null, productInfo.quantity||null, productInfo.weight||null, productInfo.volume||null, productInfo.photo||null]
      );
    }
} else {
    await conn.query(
      "INSERT INTO products (name, product_group, quantity, weight, volume, photo) VALUES(?,?,?,?,?,?);",
      [productInfo.name||null, productInfo.group||null, productInfo.quantity||null, productInfo.weight||null, productInfo.volume||null, productInfo.photo||null]
    );
  }
}


export async function saveRecord(conn: mariadb.Connection, market: string, productName: string, price: string, multibuyPrice: string | null, comment: string) {
  const res = await conn.query(
    "INSERT INTO raw_price_record (market, product_name, price, multibuy_price, comment) VALUES (?, ?, ?, ?, ?);",
    [market, productName, price, multibuyPrice, comment]
  );
  if (res.affectedRows === 1) { // { affectedRows: 1, insertId: 1, warningStatus: 0 }
    console.log('inserted record')
    return {market, productName, price, multibuyPrice, comment };
  } else {
    console.error(res);
    throw new Error("unable save result to database");
  }
}

export async function clearPriceTag(conn: mariadb.Connection) { 
  await conn.query(
    "DELETE FROM price_tags",
  );
}

export async function savePriceTag(conn: mariadb.Connection, priceTag:ProductReportDbRow) {
  const res = await conn.query(
    "INSERT INTO price_tags (photo_url, product_group, name, quantity, volume, weight, asda_url, asda_price, asda_multibuy_price, asda_comment, tesco_url, tesco_price, tesco_multibuy_price, tesco_comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [priceTag.photo||null, priceTag.group||null, priceTag.name||null, priceTag.quantity||null, priceTag.volume||null, priceTag.weight||null, priceTag.asdaUrl||null, priceTag.asda||null, priceTag.asdaMultibuyPrice||null, priceTag.asdaComment||null, priceTag.tescoUrl||null, priceTag.tesco||null, priceTag.tescoMultibuyPrice||null, priceTag.tescoComment||null]
  );
}

export async function listProducts(conn:mariadb.Connection, ) {
  // const res = await conn.query(
  //   `SELECT * from raw_price_record WHERE id IN (
  //     SELECT MAX(id)
  //     FROM raw_price_record
  //     GROUP BY product_name, market
  // );`);
  const res = await conn.query(`SELECT * from price_tags;`);
  return res;
}

export async function calcMultibuyPrice(promoText: string) {
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