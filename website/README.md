# Website

This website is built using [Docusaurus 2](https://docusaurus.io/), a modern static website generator.

## 🔥Playground

We recommand [⚡ StackBlitz 🆕](https://stackblitz.com/) here, StackBlitz uses a novel [WebContainers](https://blog.stackblitz.com/posts/introducing-webcontainers/) technology to run Docusaurus directly in your browser.

[➡️ Click here and try it now! ⬅️](https://stackblitz.com/github/pingcap/book.tidb.net/tree/main/website)

<img width="1438" alt="image" src="https://user-images.githubusercontent.com/56986964/164980058-afcd933b-7f96-4855-9088-8e0540cd6bbd.png">

### Installation

```
$ yarn
```

### Local Development

```
$ yarn start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

### Build

```
$ yarn build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

### Serve and Deployment

```
$ yarn serve
```

Nginx reverse porxy: tidb.net/book -> website.serve:3000
