# github-engagement-metrics

Engagement metrics tracking for GitHub repositories.

This repo helps with tracking things like forks, watchers, number of issues, etc. but also the issue response rate.

* To get data: run the `src/metrics.js` and `srd/unresponded.js` scripts.
* To display reports: start a web server in this repo, and navigate to `index.html`.

## Run locally

* `yarn install`
* Test locally by using your personal access token `GITHUB_PAT=<token here> node src/unresponded.js` and `GITHUB_PAT=<token here> node src/metrics.js`
* New data gets appended to the `out/unresponded.json` and `out/metrics.json` files. **Please don't check-in changes to those files**.

## TODO

* Add metric for total number of issues with more than 1 non-owner/collaborator person (organic growth).
* Add metric for total number of issues from first-time members vs. returning members.
