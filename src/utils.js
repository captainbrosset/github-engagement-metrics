import * as fs from "fs/promises";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
export const REPOS = require("./repos.json");

export const formatDate = date => {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${date.getFullYear()}-${month < 10 ? `0${month}` : month}-${day < 10 ? `0${day}` : day}`;
}

export function getYesterdayDate() {
  const date = new Date();

  date.setDate(date.getDate() - 1);
  return formatDate(date);
}
