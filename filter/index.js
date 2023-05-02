const fs = require("fs");
const cron = require("node-cron");
const https = require("https");
const http = require("http");

const WORDS_FILE = process.env.WORDS_FILE;
const REMARK_URL = process.env.REMARK_URL;
const SITE_ID = process.env.SITE_ID;
const REMARK_ADMIN = {
  user: process.env.REMARK_ADMIN_USER,
  pwd: process.env.REMARK_ADMIN_PWD,
};

const Words = JSON.parse(fs.readFileSync(WORDS_FILE).toString());

function basicAuthorizationHeader(user, pwd) {
  const credentials = btoa(`${user}:${pwd}`);
  return { Authorization: `Basic ${credentials}` };
}

function request(url, options) {
  const _request = url.startsWith("https") ? https.request : http.request;
  return new Promise((resolve, reject) => {
    const req = _request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", resolve);
    }).on("error", reject);
    req.end();
  });
}

async function getJSON(url) {
  const data = await request(url, { method: "GET" });
  return JSON.parse(data);
}

function del(url, headers) {
  const options = { method: "DELETE", headers };
  return request(url, options);
}

async function listPostUrls() {
  const data = await getJSON(`${REMARK_URL}/api/v1/list?site=${SITE_ID}`);
  return data.filter((p) => p.count).map((p) => p.url);
}

async function listActiveComments(post_url) {
  const url = `${REMARK_URL}/api/v1/find?${new URLSearchParams({
    site: SITE_ID,
    url: post_url,
    format: "plain",
  })}`;
  const { comments } = await getJSON(url);
  return comments
    .filter((c) => !c.delete)
    .map((c) => ({
      id: c.id,
      content: c.text,
      url: c.locator.url,
    }));
}

async function deleteComments(comments) {
  const authorization = basicAuthorizationHeader(
    REMARK_ADMIN.user,
    REMARK_ADMIN.pwd
  );
  await Promise.all(
    comments.map(async (comment) => {
      const url = `${REMARK_URL}/api/v1/admin/comment/${
        comment.id
      }?${new URLSearchParams({ site: SITE_ID, url: comment.url })}`;
      const data = await del(url, { ...authorization });
      if (data.trim() == "Unauthorized") throw Error("Unauthorized");
      return data;
    })
  );
}

async function audit() {
  console.log("=".repeat(30));
  console.log("[INFO] start auditing comments");
  try {
    const urls = await listPostUrls();
    let candidates = [];
    for await (const url of urls) {
      const comments = await listActiveComments(url);
      console.log(`[INFO] \t${url} comment count ${comments.length}`);
      candidates.push(...comments);
    }
    candidates = candidates.filter((c) =>
      Words.some((w) => new RegExp(w, "gi").test(c.content))
    );
    await deleteComments(candidates);
    console.log(`[INFO] \tremoved count ${candidates.length}`);
  } catch (e) {
    console.log("[ERROR] \tfilter failed -> ", e.message);
  }
  console.log("[INFO] done");
  console.log("=".repeat(30));
}

function main() {
  cron.schedule("* * * * *", () => {
    audit();
  });
}

main();
