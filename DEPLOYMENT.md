# Publish at `representation.yunusaybas.com`

This guide publishes the static State and House explorers with GitHub Pages while leaving the existing Squarespace site at `yunusaybas.com` and `www.yunusaybas.com` unchanged.

Replace `GITHUB_OWNER` below with the GitHub username or organization that owns the repository. Do not include `https://`, a repository name, or a path in DNS values.

## Before you begin

You need:

1. Administrator access to the GitHub repository.
2. Access to the Squarespace account that manages DNS for `yunusaybas.com`.
3. A public GitHub repository when using GitHub Free. GitHub Pages sites are publicly accessible, even when a paid plan allows a private source repository.

The repository must not contain secrets. This project has no runtime keys or environment variables, and its release audit checks for common credential formats and absolute local paths.

## Step 1 — Push the repository to GitHub

If the repository has not yet been pushed, create an empty GitHub repository named `representation-model-explorer`, then connect and push this local folder:

```sh
git remote add origin https://github.com/GITHUB_OWNER/representation-model-explorer.git
git branch -M main
git push -u origin main
```

Do not initialize the remote repository with a README, license, or `.gitignore` if those files already exist locally.

## Step 2 — Turn on GitHub Pages

1. Open the repository on GitHub.
2. Select **Settings**.
3. In the left sidebar, select **Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch **main**.
6. Select folder **/(root)**.
7. Click **Save**.
8. Open the repository’s **Actions** tab and wait for the first Pages deployment to finish.
9. Test the temporary project address:

   `https://GITHUB_OWNER.github.io/representation-model-explorer/`

The custom domain will replace this project-path address later.

## Step 3 — Verify ownership of `yunusaybas.com` in GitHub

GitHub recommends verifying the root domain before attaching a custom subdomain. Verifying `yunusaybas.com` also protects its immediate subdomains against takeover.

For a personal GitHub account:

1. Open your GitHub profile menu.
2. Select **Settings**.
3. Select **Pages**.
4. In **Verified domains**, click **Add a domain**.
5. Enter `yunusaybas.com`.
6. GitHub displays a TXT record name and value. Keep this page open and copy both exactly.

For an organization-owned repository, use **Organization → Settings → Pages** instead.

Now add the verification TXT record in Squarespace:

1. In Squarespace, open **Domains**.
2. Select `yunusaybas.com`.
3. Open **DNS → DNS Settings**.
4. Scroll to **Custom Records** and select **Add record**.
5. Choose **TXT**.
6. In **Name**, enter only the host prefix GitHub generated, commonly `_github-pages-challenge-GITHUB_OWNER`. Squarespace appends `.yunusaybas.com` automatically.
7. In **Text** or **Data**, paste the exact verification value from GitHub.
8. Leave TTL at the Squarespace default and save.
9. After the record propagates, return to GitHub and click **Verify**.

Keep this TXT record permanently. Removing it can cause the verified status to be lost.

Optional DNS check:

```sh
dig _github-pages-challenge-GITHUB_OWNER.yunusaybas.com +short TXT
```

## Step 4 — Set the custom domain in the repository

Do this before adding the routing CNAME in Squarespace.

1. Open **Repository → Settings → Pages**.
2. Under **Custom domain**, enter exactly:

   `representation.yunusaybas.com`

3. Click **Save**.

Do not enter a protocol, path, or trailing slash. The repository already includes an uppercase `CNAME` file containing exactly the same hostname. If GitHub changes that file through its settings interface, pull the resulting commit before making another local push.

## Step 5 — Add the `representation` CNAME in Squarespace

1. In Squarespace, open **Domains**.
2. Select `yunusaybas.com`.
3. Open **DNS → DNS Settings**.
4. Scroll to **Custom Records** and select **Add record**.
5. Enter:

   | Field | Value |
   | --- | --- |
   | Type | `CNAME` |
   | Name / Host | `representation` |
   | Data / Points to | `GITHUB_OWNER.github.io` |
   | TTL | Squarespace default |

6. Save the record.

The destination is the GitHub user or organization hostname—not the repository URL.

Correct: `GITHUB_OWNER.github.io`

Incorrect:

- `https://GITHUB_OWNER.github.io`
- `GITHUB_OWNER.github.io/representation-model-explorer`
- `yunusaybas.com`

Before saving, make sure another `A`, `AAAA`, `CNAME`, or forwarding rule does not already use the host `representation`.

## Step 6 — Leave the Squarespace website records alone

Only the new subdomain is moving to GitHub Pages. Do not delete or change:

- Squarespace default records
- Root `@` records
- The existing `www` record
- MX or other email records
- Any unrelated subdomain records

Do not add GitHub’s apex-domain `A` or `AAAA` records, a wildcard `*` record, or a Squarespace forwarding rule for `representation`.

If Squarespace shows the domain but its nameservers are hosted by another provider, create the TXT and CNAME records at the actual DNS provider instead.

## Step 7 — Wait for DNS and certificate provisioning

Check the routing record:

```sh
dig representation.yunusaybas.com +short
```

It should eventually return `GITHUB_OWNER.github.io.`

GitHub says DNS changes can take up to 24 hours. Squarespace recommends allowing up to 24–48 hours, so use 48 hours as the conservative troubleshooting window. The site may work sooner.

In **Repository → Settings → Pages**, wait for the DNS check to succeed and for GitHub to provision a certificate.

## Step 8 — Enforce HTTPS

After GitHub makes the option available:

1. Open **Repository → Settings → Pages**.
2. Enable **Enforce HTTPS**.
3. Open <https://representation.yunusaybas.com>.
4. Confirm that `http://representation.yunusaybas.com` redirects to HTTPS.

Certificate provisioning commonly finishes within an hour of correct DNS configuration, but GitHub notes that the HTTPS option can take up to 24 hours to appear.

## Step 9 — Perform the publication check

Verify all of the following:

1. `yunusaybas.com` still opens the Squarespace site.
2. `www.yunusaybas.com` still behaves as before.
3. `representation.yunusaybas.com` opens the State explorer directly.
4. The **State** and **House** menu links open `index.html` and `house.html`, with the current page identified.
5. The browser shows a valid HTTPS certificate.
6. State and year selectors update the map and diagnostics.
7. Fine-tune/full-range controls and all four State figures work.
8. A copied State query-string permalink opens the same state, year, weight, target, and map mode.
9. The House year selector, weight slider, and previous/next composition controls update the covered panel and state table.
10. Map and figure PNG downloads work and the paper PDF opens.
11. There are no missing images, fonts, scripts, or mixed-content errors in the browser console.

## Step 10 — Publish future updates

Commit and push changes to `main`:

```sh
git add -A
git commit -m "Update State and House explorers"
git push
```

GitHub Pages republishes the branch automatically. The quality workflow also runs `npm test` on every push to `main`.

## Troubleshooting

If DNS succeeds but HTTPS remains unavailable:

1. Confirm `representation` has only the intended CNAME.
2. Confirm the target is `GITHUB_OWNER.github.io`, without the repository name.
3. If the domain has CAA records, make sure at least one permits `letsencrypt.org`.
4. Remove and re-add the custom domain under **Repository → Settings → Pages** to restart certificate provisioning.
5. Check for and remove conflicting wildcard DNS records.
6. Wait for the full 48-hour DNS window before changing working records repeatedly.

## Official documentation

- [GitHub: Configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub: Creating a Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
- [GitHub: Verifying a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages)
- [GitHub: Managing a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [GitHub: Securing Pages with HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
- [Squarespace: Pointing a subdomain](https://support.squarespace.com/hc/en-us/articles/215744668-Pointing-a-Squarespace-domain#toc-point-a-squarespace-subdomain)
- [Squarespace: Editing DNS records](https://support.squarespace.com/hc/en-us/articles/360002101888-Edit-your-domain-s-DNS-records)
- [Squarespace: Adding TXT records](https://support.squarespace.com/hc/en-us/articles/31120980444429-Adding-TXT-records)
