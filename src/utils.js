import { createRequire } from "module";

const MAX_TITLE_LENGTH = 60;

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

export function formatTitle(title) {
  if (title.length < MAX_TITLE_LENGTH) {
    return title;
  }
  return title.substring(0, MAX_TITLE_LENGTH) + '...';
}
