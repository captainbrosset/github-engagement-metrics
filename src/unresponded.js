import * as fs from 'fs/promises';
import { graphql } from "@octokit/graphql";
import { REPOS, formatDate, formatTitle } from "./utils.js";

// This needs to be run against a small number of issues, to avoid it taking too long
// and hitting the API rate limit. So we only get the last X issues instead of all.
const ISSUES_LIMIT = 50;

// For the same reason, we also limit how many comments we get per issue.
const COMMENTS_LIMIT = 100;

// Where to save the data to.
const DATA_FILE = "./out/unresponded.json";
const MD_FILE = "./out/unresponded.md";

const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${process.env.GH_PAT}`,
  },
});

function getQuery(repo) {
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
    search(last: ${ISSUES_LIMIT}, type: ISSUE, query: "${q}") {
      issueCount,
      nodes {
        ... on PullRequest {
          number,
          title,
          state,
          url,
          author { login },
          authorAssociation,
          isDraft,
          comments(last: ${COMMENTS_LIMIT}) {
            nodes {
              author { login }
            }
          }
        },
        ... on Issue {
          number,
          title,
          state,
          url,
          author { login },
          authorAssociation,
          comments(last: ${COMMENTS_LIMIT}) {
            nodes {
              author { login }
            }
          }
        }
      }
    }
  }`;
}

async function getRepoData(repo) {
  if (!repo.issues && !repo.prs) {
    return [];
  }

  const data = await graphqlWithAuth(getQuery(repo));
  const issues = data.search.nodes.filter(node => !node.isDraft);

  // Simplify comments.
  for (const issue of issues) {
    const comments = [];
    for (const comment of issue.comments.nodes) {
      if (comment.author && (!repo.ignoreCommentsFrom || !repo.ignoreCommentsFrom.includes(comment.author.login))) {
        comments.push(comment);
      }
    }
    issue.comments = comments;
  }

  return issues;
}

async function getUnRespondedItems(items) {
  // Preload the list with open items with 0 comments. Those are obviously unresponded.
  let unRespondedItems = items.filter(item => item.state === 'OPEN' && item.comments.length === 0);

  // Then check all open items that have been commented on, and verify that at least
  // 1 comment is from somebody else, AND that the last comment isn't from the reporter
  // (to track issues we have responded to, but where the reporter asked another question).
  const commented = items.filter(item => item.state === 'OPEN' && item.comments.length > 0);
  for (const item of commented) {
    const lastComment = item.comments[item.comments.length - 1];

    // deleted users have null author, ignore them
    const someoneElseCommented = item.comments.some(comment => comment.author.login !== item.author.login);
    const lastCommentIsFromReporter = lastComment.author.login === item.author.login;

    if (!someoneElseCommented || lastCommentIsFromReporter) {
      unRespondedItems.push(item);
    }
  }

  // Remove all issues that were created by members of the org.
  unRespondedItems = unRespondedItems.filter(item => item.authorAssociation !== 'MEMBER');

  console.log(`Found ${unRespondedItems.length} unresponded items`);
  console.log(unRespondedItems.map(i => i.url));

  return unRespondedItems.map(formatUnrespondedItem);
}

function formatUnrespondedItem(item) {
  return {
    title: item.title,
    url: item.url
  };
}

async function getResponseRateData(repo) {
  const items = await getRepoData(repo);
  console.log(`Got ${items.length} items`);

  const unRespondedItems = await getUnRespondedItems(items);

  return { items, unRespondedItems };
}

async function getData() {
  const data = {};

  for (const repo of REPOS) {
    console.log(`Getting data for ${repo.org}/${repo.repo} ...`);

    const { items, unRespondedItems } = await getResponseRateData(repo);
    const rate = items.length ? ((items.length - unRespondedItems.length) * 100 / items.length).toFixed(2) : 100;

    data[`${repo.org}/${repo.repo}`] = {
      date: formatDate(new Date()),
      unRespondedItems,
      rate
    };
  }

  console.log('Done getting data');

  return data;
}

async function storeToDataFile(data) {
  console.log('Generating the metrics JSON file ...');

  // Read from the file (parse JSON).
  // The file always exists (it was initially created empty), no need to check if it does.
  const content = await fs.readFile(DATA_FILE, { encoding: 'utf-8' });
  const existingData = JSON.parse(content);

  // Remove all of the existing unRespondedItems properties. We only care about the rate for
  // past days, and want the unRespondedItems only for the last day that's about to be
  // generated.
  for (const repo in existingData) {
    for (const day in existingData[repo]) {
      delete existingData[repo][day].unRespondedItems;
    }
  }

  // Append the data to it.
  for (const repo in data) {
    if (!existingData[repo]) {
      existingData[repo] = [];
    }

    existingData[repo].push(data[repo]);
  }

  // Write back to disk.
  const newContent = JSON.stringify(existingData, null, 2);
  await fs.writeFile(DATA_FILE, newContent);

  return data;
}

async function storeDaySnapshotToMDFile(data) {
  console.log("Generating the snapshot markdown file ...");

  const content = [];

  let rate = 0;
  for (const repo in data) {
    rate += parseFloat(data[repo].rate);

    content.push(`* ${repo}: ${data[repo].rate}%`);
    if (data[repo].unRespondedItems && data[repo].unRespondedItems.length) {
      for (const item of data[repo].unRespondedItems) {
        content.push(`   * [${formatTitle(item.title)}](${item.url})`);
      }
    }
  }
  rate = rate / Object.keys(data).length;

  await fs.writeFile(MD_FILE, `Response rate: ${rate.toFixed(2)}%\n\n${content.join('\n')}`);
}

getData().then(storeToDataFile).then(storeDaySnapshotToMDFile);
