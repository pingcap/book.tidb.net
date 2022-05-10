// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require("prism-react-renderer/themes/github");
const darkCodeTheme = require("prism-react-renderer/themes/dracula");

const BASE_URL = process.env.BASE_URL || `/book/`;

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "TiDB Books",
  tagline: "TiDB Books",
  url: "https://tidb.net",
  baseUrl: BASE_URL,
  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",
  favicon: "img/book_favicon.png",
  organizationName: "pingcap", // Usually your GitHub org/user name.
  projectName: "book.tidb.net", // Usually your repo name.

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        // docs: {
        //   sidebarPath: require.resolve("./sidebars.js"),
        //   path: "monthly",
        //   routeBasePath: "/monthly",
        //   // Please change this to your repo.
        //   // editUrl: "https://github.com/pingcap/book.tidb.net/tree/main/website",
        // },
        docs: false,
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      }),
    ],
  ],

  plugins: [
    [
      "@docusaurus/plugin-client-redirects",
      {
        fromExtensions: ["html", "htm"], // /myPage.html -> /myPage
        redirects: [
          // Redirect /book/ => /book/monthly/
          {
            to: "/tidb-monthly/",
            from: "/",
          },
        ],
      },
    ],
    [
      "content-docs",
      /** @type {import('@docusaurus/plugin-content-docs').Options} */
      ({
        id: "tidb-monthly",
        path: "tidb-monthly",
        routeBasePath: "/tidb-monthly",
        editUrl: "https://github.com/pingcap/book.tidb.net/tree/main/website",
        sidebarPath: require.resolve("./sidebars.js"),
      }),
    ],
    [
      "content-docs",
      /** @type {import('@docusaurus/plugin-content-docs').Options} */
      ({
        id: "book-rush",
        path: "book-rush",
        routeBasePath: "/book-rush",
        editUrl: "https://github.com/pingcap/book.tidb.net/tree/main/website",
        // editUrl: ({locale, versionDocsDirPath, docPath}) => {
        //   if (locale !== 'en') {
        //     return `https://github.com/pingcap/book.tidb.net/tree/main/website/${locale}`;
        //   }
        //   return `https://github.com/pingcap/book.tidb.net/tree/main/website/${versionDocsDirPath}/${docPath}`;
        // },
        sidebarPath: require.resolve("./sidebars.js"),
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: "TiDB | Books",
        logo: {
          alt: "TiDB | Community Logo",
          src: "img/logo.svg",
          href: `/tidb-monthly`,
        },
        items: [
          {
            to: "https://tidb.net",
            position: "left",
            label: "社区首页",
          },
          {
            to: "/tidb-monthly",
            position: "left",
            label: "社区月刊",
          },
          {
            to: "/book-rush",
            position: "left",
            label: "🔥 Book Rush",
          },
          {
            href: "https://github.com/pingcap/book.tidb.net",
            label: "GitHub",
            position: "right",
          },
        ],
      },
      footer: {
        style: "dark",
        links: [
          {
            title: "互助与交流",
            items: [
              {
                label: "活动",
                to: "https://tidb.net/events",
              },
              {
                label: "问答论坛",
                href: "https://asktug.com/",
              },
              {
                label: "开发者论坛",
                href: "https://internals.tidb.io",
              },
              {
                label: "TiKV 社区",
                href: "https://tikv.org/",
              },
              {
                label: "Chaos Mesh 社区",
                href: "https://chaos-mesh.org/",
              },
            ],
          },
          {
            title: "学习与应用",
            items: [
              {
                label: "文档",
                href: "https://docs.pingcap.com/zh/tidb/stable",
              },
              {
                label: "专栏",
                to: "https://tidb.net/blog",
              },
              {
                label: "视频课程",
                href: "https://learn.pingcap.com/learner/course",
              },
              {
                label: "考试认证",
                href: "https://learn.pingcap.com/learner/certification-center",
              },
              {
                label: "典型案例",
                href: "https://pingcap.com/case/",
              },
              {
                label: "贡献者指南",
                href: "https://pingcap.github.io/tidb-dev-guide",
              },
            ],
          },
          {
            title: "发现社区",
            items: [
              {
                label: "TiDB User Group",
                to: "https://tidb.net/tug",
              },
              {
                label: "问答之星",
                href: "https://asktug.com/x/ranking",
              },
              {
                label: "工作机会",
                href: "https://tidb-jobs.pingcap.com/",
              },
              {
                label: "社区准则",
                href: "https://github.com/pingcap/community/blob/master/CODE_OF_CONDUCT.md?from=from_parent_mindnote",
              },
              {
                label: "联系我们",
                href: "https://pingcap.com/zh/contact",
              },
            ],
          },
          {
            title: "More",
            items: [
              {
                label: "Mail",
                href: "mailto:user-zh@tidb.io",
              },
              {
                label: "GitHub",
                href: "https://github.com/pingcap/community",
              },
              {
                label: "BiliBili",
                href: "https://space.bilibili.com/584479667",
              },
            ],
          },
        ],
        copyright: `© ${new Date().getFullYear()} TiDB Community. <a href="https://beian.miit.gov.cn" target="_blank" rel="noreferrer">京ICP备16046278号-7</a> <a href="http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=11010802039111" target="_blank" rel="noreferrer"><span><img src="https://img1.tidb.net/images/beian.png" alt="beian">京公网安备 11010802039111号</span></a>`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
      },
    }),
};

module.exports = config;
