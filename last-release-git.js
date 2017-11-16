/**
 * modified from: https://github.com/finom/last-release-git
 */

const { clean, lt } = require('semver')
const SemanticReleaseError = require('@semantic-release/error')

module.exports = async config => {
  const { tags } = config
  const refs = tags.data

  let latestVersion
  let latestVersionCommitHash

  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i]
    const { name: refName, commit: { sha: commitHash } } = ref
    const version = clean(refName)

    // version is null if not valid
    if (version && (!latestVersion || lt(latestVersion, version))) {
      latestVersion = version
      latestVersionCommitHash = commitHash
    }
  }

  if (!latestVersion) {
    throw new SemanticReleaseError(
      'There is no valid semver git tag. Create the first valid tag via "git tag v0.0.0" and then push it via "git push --tags".'
    )
  }

  return {
    version: latestVersion,
    gitHead: latestVersionCommitHash
  }
}
