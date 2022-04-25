import Koa from "koa";
import { cronSupermarket } from "../cron-supermarket"
import Router from "@koa/router"
import { listProducts } from "../libs";
import toml from "toml";
import fs from "fs";
import mariadb from 'mariadb';
import cors from "@koa/cors";

const app = new Koa();
app.use(cors({ origin: '*' }));

const router = new Router();

const { mariaDbInfo } = toml.parse(fs.readFileSync("conf/conf.toml", { encoding: "utf-8" }));
let pool = mariadb.createPool(mariaDbInfo);

app.use(async (ctx, next) => {
  let conn = await pool.getConnection();
  if (!conn.isValid()) { 
    console.warn("connection is invalid, retrying..");
    pool = mariadb.createPool(mariaDbInfo);
    conn = await pool.getConnection();
  }
  ctx.state.conn = conn;
  await next();
  await conn.end();
})
// response
router.get('/', (ctx, next) => {
  ctx.body = "hello";
});
router.get("/products", async (ctx, next) => {
  ctx.body = await listProducts(ctx.state.conn);
});
app.use(router.routes());

app.listen(4000);
console.log("listing on 4000")
cronSupermarket();