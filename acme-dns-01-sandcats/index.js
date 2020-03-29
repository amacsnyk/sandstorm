'use strict';

const https = require("https");
const querystring = require("querystring");
const dns = require("dns");

class Challenge {
  constructor(options) {
    this.key = options.key;
    this.cert = options.cert;
    this.hostname = options.hostname;
    this.bindIp = options.bindIp;
    this.isTest = options.isTest;
  }

  async init({request}) {
    return null;
  }

  async zones({dnsHosts}) {
    return [this.hostname + ".sandcats.io"];
  }

  async set({challenge: {dnsAuthorization}}) {
    return this._request({
      rawHostname: this.hostname,
      value: dnsAuthorization
    });
  }

  async get({challenge: {dnsAuthorization}}) {
    if (this.isTest) {
      // The test driver tends to run into problems with caching that don't appear in real-world
      // usage.
      console.log("waiting 30 seconds for propagation");
      await new Promise(resolve => setTimeout(resolve, 30000));
    }

    // HACK: We ignore the hostname given by ACME.js and assume `_acme-challenge` since that's
    //   what it always is in practice, and we don't have an API to modify arbitrary hostnames.
    let results = await new Promise((resolve, reject) => {
      dns.resolveTxt("_acme-challenge." + this.hostname + ".sandcats.io", (err, result) => {
        if (err) {
          if (err.code == dns.NOTFOUND || err.code == dns.NODATA) {
            resolve([]);
          } else {
            reject(err);
          }
        } else {
          resolve(result);
        }
      });
    });

    let records = results.map(chunks => chunks.join(""));
    let match = records.filter(record => record === dnsAuthorization);
    if (match[0]) {
      return {dnsAuthorization: match[0]};
    } else {
      return null;
    }
  }

  async remove() {
    // HACK: We always remove all challenges when asked to remove anything, because in practice
    //   ACME.js only calls remove() when it's time to remove everything, and I didn't want to
    //   build an API for removing individual challenges.
    return this._request({
      rawHostname: this.hostname
    });
  }

  async _request(postData) {
    let options = {
      hostname: "sandcats.io",
      path: "/acme-challenge",
      method: "POST",
      agent: false,
      key: this.key,
      cert: this.cert,
      headers: {
        "X-Sand": "cats",
        "Content-Type": "application/x-www-form-urlencoded",
      },
    };

    if (this.bindIp) {
      options.localAddress = bindIp;
    }

    let postDataString = querystring.stringify(postData);

    let response = await new Promise((resolve, reject) => {
      const req = https.request(options, resolve);
      req.write(postDataString);
      req.end();
      req.on("error", reject);
    });

    let responseBody = "";
    response.on("data", chunk => { responseBody += chunk; });
    await new Promise((resolve, reject) => {
      response.on("end", resolve);
      response.on("error", reject);
    });

    if (response.statusCode != 200) {
      throw new Error("sandcats request failed: " + response.statusCode + ": " + responseBody);
    }

    return null;
  }
};

module.exports = {
  create(options) {
    return new Challenge(options);
  }
};
