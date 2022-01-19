const { request, logger } = require("../common/utils");
const retryer = require("../common/retryer");
require("dotenv").config();

const private_fetcher = (variables, token) => {
  return request(
    {
      query: `
      query userInfo($login: String!) {
        user(login: $login) {
          repositoriesContributedTo(first: 50, privacy: PRIVATE, includeUserRepositories: true, orderBy: {field: UPDATED_AT, direction: DESC}, contributionTypes: [COMMIT, PULL_REQUEST]) {
            nodes {
              name
              languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                edges {
                  size
                  node {
                    color
                    name
                  }
                }
              }
            }
          }
          repositories(affiliations: [OWNER, COLLABORATOR], isFork: false, first: 10, privacy: PRIVATE, orderBy: {field: UPDATED_AT, direction: DESC}) {
            nodes {
              name
              languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                edges {
                  node {
                    name
                    color
                  }
                  size
                }
              }
            }
          }
        }
      }
      `,
      variables,
    },
    {
      Authorization: `token ${token}`,
    },
  );
};

const public_fetcher = (variables, token) => {
  return request(
    {
      query: `
      query userInfo($login: String!) {
        user(login: $login) {
          repositoriesContributedTo(first: 50, privacy: PUBLIC, includeUserRepositories: true, orderBy: {field: UPDATED_AT, direction: DESC}, contributionTypes: [COMMIT, PULL_REQUEST]) {
            nodes {
              name
              languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                edges {
                  size
                  node {
                    color
                    name
                  }
                }
              }
            }
          }
          repositories(affiliations: [OWNER, COLLABORATOR], isFork: false, first: 10, privacy: PUBLIC, orderBy: {field: UPDATED_AT, direction: DESC}) {
            nodes {
              name
              languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                edges {
                  node {
                    name
                    color
                  }
                  size
                }
              }
            }
          }
        }
      }
      `,
      variables,
    },
    {
      Authorization: `token ${token}`,
    },
  );
};

async function fetchTopLanguages(username, exclude_repo = []) {
  if (!username) throw Error("Invalid username");

  const privateRes = await retryer(private_fetcher, { login: username });
  const publicRes = await retryer(public_fetcher, { login: username });

  let privateTopLangs = parseTopLanguages(privateRes, exclude_repo);
  let publicTopLangs = parseTopLanguages(publicRes, exclude_repo);

  for (var private in privateTopLangs) {
    for (var public in publicTopLangs) {
      if (private == public)
        privateTopLangs[private].size += publicTopLangs[private].size;
    }
  }

  for (var private in privateTopLangs) {
    for (var public in publicTopLangs) {
      if (private in public == false)
        privateTopLangs[private] = publicTopLangs[private];
    }
  }

  return privateTopLangs;
}

function parseTopLanguages(res, exclude_repo = []) {
  if (res.data.errors) {
    logger.error(res.data.errors);
    throw Error(res.data.errors[0].message || "Could not fetch user");
  }

  let repoNodes = res.data.data.user.repositories.nodes;
  let contributedRepoNodes = res.data.data.user.repositoriesContributedTo.nodes;
  let repoToHide = {};

  // populate repoToHide map for quick lookup
  // while filtering out
  if (exclude_repo) {
    exclude_repo.forEach((repoName) => {
      repoToHide[repoName] = true;
    });
  }

  // filter out repositories to be hidden
  repoNodes = repoNodes
    .sort((a, b) => b.size - a.size)
    .filter((name) => {
      return !repoToHide[name.name];
    });

  contributedRepoNodes = contributedRepoNodes
    .filter((name) => {
      return !repoToHide[name.name];
    })
    .filter((name) => {
      for (var n of repoNodes)
        return n.name != name.name;
    });

  repoNodes.push(...contributedRepoNodes);

  repoNodes = repoNodes
    .filter((node) => {
      return node.languages.edges.length > 0;
    })
    // flatten the list of language nodes
    .reduce((acc, curr) => curr.languages.edges.concat(acc), [])
    .reduce((acc, prev) => {
      // get the size of the language (bytes)
      let langSize = prev.size;

      // if we already have the language in the accumulator
      // & the current language name is same as previous name
      // add the size to the language size.
      if (acc[prev.node.name] && prev.node.name === acc[prev.node.name].name) {
        langSize = prev.size + acc[prev.node.name].size;
      }
      return {
        ...acc,
        [prev.node.name]: {
          name: prev.node.name,
          color: prev.node.color,
          size: langSize,
        },
      };
    }, {});

  const topLangs = Object.keys(repoNodes)
    .sort((a, b) => repoNodes[b].size - repoNodes[a].size)
    .reduce((result, key) => {
      result[key] = repoNodes[key];
      return result;
    }, {});

  return topLangs;
}

module.exports = fetchTopLanguages;
