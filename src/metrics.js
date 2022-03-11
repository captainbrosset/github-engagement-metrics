import * as fs from 'fs/promises';
import { graphql } from "@octokit/graphql";
import { Octokit } from "@octokit/core";
import { REPOS, formatDate, getYesterdayDate } from "./utils.js";

// Where to save the data to.
const DATA_FILE = "./out/metrics.json";

const octokit = new Octokit({ auth: process.env.GITHUB_PAT });

const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${process.env.GITHUB_PAT}`,
  },
});


function getQueryForStatsAndIssues(repo) {
  let q = `repo:${repo.org}/${repo.repo}`;

  if (repo.ignoreIssuesFrom && repo.ignoreIssuesFrom.length) {
    q += ` -author:${repo.ignoreIssuesFrom.join(' -author:')}`;
  }

  if (repo.issues && !repo.prs) {
    q += ' is:issue';
  }

  if (repo.prs && !repo.issues) {
    q += ' is:pr';
  }

  return `
  { 
    stats: repository(owner: "${repo.org}", name: "${repo.repo}") {
      stargazerCount,
      forkCount,
      watchers { totalCount }
    },
    dailyIssues: search(type: ISSUE, query: "${q} created:${getYesterdayDate()}") { issueCount },
    totalIssues: search(type: ISSUE, query: "${q}") { issueCount }
  }`;
}

async function getRepoData(repo) {
  // Get stats and issues.
  const statsAndIssuesData = await graphqlWithAuth(getQueryForStatsAndIssues(repo));

  // Get views.
  let viewCount = 0;
  let uniqueViewCount = 0;

  try {
    const { data } = await octokit.request('GET /repos/{org}/{repo}/traffic/views', {
      org: repo.org,
      repo: repo.repo,
      per: 'day'
    });

    // Get yesterday's views (today's are not complete yet).
    const yesterdayViews = data.views[data.views.length - 2];
    viewCount = yesterdayViews.count;
    uniqueViewCount = yesterdayViews.uniques;
  } catch (e) {
    // We need PUSH access to a repo to get views. Silently fail if we don't.
  }

  return {
    date: formatDate(new Date()),
    stats: {
      stars: statsAndIssuesData.stats.stargazerCount,
      forks: statsAndIssuesData.stats.forkCount,
      watchers: statsAndIssuesData.stats.watchers.totalCount
    },
    views: { viewCount, uniqueViewCount },
    totalIssues: statsAndIssuesData.totalIssues.issueCount,
    dailyIssues: statsAndIssuesData.dailyIssues.issueCount,
  };
}

async function getData() {
  const data = {};

  for (const repo of REPOS) {
    console.log(`Getting metrics for ${repo.org}/${repo.repo} ...`);

    data[`${repo.org}/${repo.repo}`] = await getRepoData(repo);
  }

  console.log('Done getting metrics');

  return data;
}

async function storeToDataFile(data) {
  console.log('Generating the metrics JSON file ...');

  // Read from the file (parse JSON).
  // The file always exists (it was initially created empty), no need to check if it does.
  const content = await fs.readFile(DATA_FILE, { encoding: 'utf-8' });
  const existingData = JSON.parse(content);

  // Append the data to it.
  for (const repo in data) {
    if (!existingData[repo]) {
      existingData[repo] = [];
    }

    existingData[repo].push(data[repo]);
  }

  // Write back to disk.
  const newContent = JSON.stringify(existingData);
  await fs.writeFile(DATA_FILE, newContent);
}

getData().then(storeToDataFile);
