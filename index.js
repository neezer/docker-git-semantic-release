const url = require('url')
const { promisify } = require('util')
const marked = require('marked')
const TerminalRenderer = require('marked-terminal')
const GitHubApi = require('github')
const parseSlug = require('parse-github-repo-url')
const SemanticReleaseError = require('@semantic-release/error')
const getNextVersion = require('./semantic-release/src/lib/get-next-version')
const getCommits = require('./semantic-release/src/lib/get-commits')
const logger = require('./semantic-release/src/lib/logger')
const githubRelease = require('./github-release')

const env = process.env

const verifyConditions = (pluginConfig, config, callback) => {
  if (config.env.CI === 'true') {
    callback(null)
  } else {
    callback(new SemanticReleaseError("Not running on CI, won't be published."))
  }
}

const plugins = {
  analyzeCommits: promisify(
    require('@semantic-release/commit-analyzer').bind(null, {})
  ),
  generateNotes: promisify(
    require('@semantic-release/release-notes-generator').bind(null, {})
  ),
  getLastRelease: require('./last-release-git'),
  verifyConditions: promisify(verifyConditions.bind(null, {}))
}

const pkg = {
  name: env.PROJECT_NAME,
  repository: {
    url: env.GITHUB_URL
  }
}

const options = {
  dryRun: true,
  branch: 'master',
  fallbackTags: { next: 'latest' },
  githubToken: env.GITHUB_TOKEN,
  githubUrl: env.GITHUB_URL
}

const semanticRelease = async opts => {
  const { tags } = opts

  logger.log(
    'Run automated release for %s on branch %s',
    pkg.name,
    options.branch
  )

  if (!options.dryRun && !options.githubToken) {
    throw new SemanticReleaseError('No github token specified.', 'ENOGHTOKEN')
  }

  if (!options.dryRun) {
    logger.log('Call plugin %s', 'verify-conditions')
    await plugins.verifyConditions({ env, options, pkg, logger }, {})
  }

  logger.log('Call plugin %s', 'get-last-release')
  const { commits, lastRelease } = await getCommits(
    await plugins.getLastRelease({ tags, env, options, pkg, logger }, {}),
    options.branch
  )

  logger.log('Call plugin %s', 'analyze-commits')
  const type = await plugins.analyzeCommits({
    env,
    options,
    pkg,
    logger,
    lastRelease,
    commits
  })

  if (!type) {
    throw new SemanticReleaseError(
      'There are no relevant changes, so no new version is released.',
      'ENOCHANGE'
    )
  }

  const nextRelease = { type, version: getNextVersion(type, lastRelease) }

  logger.log('Call plugin %s', 'generate-notes')
  const notes = await plugins.generateNotes(
    {
      env,
      options,
      pkg,
      logger,
      lastRelease,
      commits,
      nextRelease
    },
    {}
  )

  if (options.dryRun) {
    marked.setOptions({ renderer: new TerminalRenderer() })
    logger.log('Release note for version %s:\n', nextRelease.version)
    console.log(marked(notes))
  } else {
    const { releaseUrl, releaseId } = await githubRelease(
      pkg,
      notes,
      nextRelease.version,
      options
    )
    logger.log('Published Github release: %s', releaseUrl)
    logger.log('Github release ID: %s', releaseId)
  }

  logger.log('New version is: %s', nextRelease.version)
}

const fetchTags = async () => {
  const [owner, repo] = parseSlug(pkg.repository.url)

  let { port, protocol } = options.githubUrl ? url.parse(options.githubUrl) : {}

  protocol = (protocol || '').split(':')[0] || null

  const github = new GitHubApi({
    port,
    protocol,
    pathPrefix: null
  })

  github.authenticate({ type: 'token', token: options.githubToken })

  const tags = await github.repos.getTags({ owner, repo })

  return tags
}

// run the thing
;(async function () {
  try {
    const tags = await fetchTags()

    await semanticRelease({ tags })
  } catch (error) {
    console.log(error)
  }
})()
