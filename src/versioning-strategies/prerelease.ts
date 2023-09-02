// Copyright 2023 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {DefaultVersioningStrategy} from './default';
import {Version} from '../version';
import {ConventionalCommit} from '..';
import {
  VersionUpdater,
  CustomVersionUpdate,
  MinorVersionUpdate,
  MajorVersionUpdate,
} from '../versioning-strategy';

const PRERELEASE_NUMBER = /(?<number>\d+)(?=\D*$)/;

abstract class AbstractPrereleaseVersionUpdate implements VersionUpdater {
  protected readonly prereleaseType?: string;

  constructor(prereleaseType?: string) {
    this.prereleaseType = prereleaseType;
  }

  protected bumpPrerelease(prerelease: string): string {
    const match = prerelease.match(PRERELEASE_NUMBER);

    let nextPrerelease = `${prerelease}.0`;

    if (match?.groups) {
      const numberLength = match.groups.number.length;
      const nextPrereleaseNumber = Number(match.groups.number) + 1;
      const paddedNextPrereleaseNumber = `${nextPrereleaseNumber}`.padStart(
        numberLength,
        '0'
      );
      nextPrerelease = prerelease.replace(
        PRERELEASE_NUMBER,
        paddedNextPrereleaseNumber
      );
    }
    return nextPrerelease;
  }

  abstract bump(version: Version): Version;
}

class PrereleasePatchVersionUpdate extends AbstractPrereleaseVersionUpdate {
  /**
   * Returns the new bumped version
   *
   * @param {Version} version The current version
   * @returns {Version} The bumped version
   */
  bump(version: Version): Version {
    if (version.preRelease) {
      const nextPrerelease = this.bumpPrerelease(version.preRelease);
      return new Version(
        version.major,
        version.minor,
        version.patch,
        nextPrerelease,
        version.build
      );
    }
    return new Version(
      version.major,
      version.minor,
      version.patch + 1,
      this.prereleaseType,
      version.build
    );
  }
}

class PrereleaseMinorVersionUpdate extends AbstractPrereleaseVersionUpdate {
  /**
   * Returns the new bumped version
   *
   * @param {Version} version The current version
   * @returns {Version} The bumped version
   */
  bump(version: Version): Version {
    if (version.preRelease) {
      if (version.patch === 0) {
        const nextPrerelease = this.bumpPrerelease(version.preRelease);

        return new Version(
          version.major,
          version.minor,
          version.patch,
          nextPrerelease,
          version.build
        );
      }

      return new MinorVersionUpdate().bump(version);
    }
    return new Version(
      version.major,
      version.minor + 1,
      0,
      this.prereleaseType,
      version.build
    );
  }
}

class PrereleaseMajorVersionUpdate extends AbstractPrereleaseVersionUpdate {
  /**
   * Returns the new bumped version
   *
   * @param {Version} version The current version
   * @returns {Version} The bumped version
   */
  bump(version: Version): Version {
    if (version.preRelease) {
      if (version.patch === 0 && version.minor === 0) {
        const nextPrerelease = this.bumpPrerelease(version.preRelease);
        return new Version(
          version.major,
          version.minor,
          version.patch,
          nextPrerelease,
          version.build
        );
      }
      return new MajorVersionUpdate().bump(version);
    }
    return new Version(
      version.major + 1,
      0,
      0,
      this.prereleaseType,
      version.build
    );
  }
}

/**
 * This versioning strategy will increment the pre-release number for patch
 * bumps if there is a pre-release number (preserving any leading 0s).
 * Example: 1.2.3-beta01 -> 1.2.3-beta02.
 */
export class PrereleaseVersioningStrategy extends DefaultVersioningStrategy {
  determineReleaseType(
    version: Version,
    commits: ConventionalCommit[]
  ): VersionUpdater {
    // iterate through list of commits and find biggest commit type
    let breaking = 0;
    let features = 0;
    for (const commit of commits) {
      const releaseAs = commit.notes.find(note => note.title === 'RELEASE AS');
      if (releaseAs) {
        // commits are handled newest to oldest, so take the first one (newest) found
        this.logger.debug(
          `found Release-As: ${releaseAs.text}, forcing version`
        );
        return new CustomVersionUpdate(
          Version.parse(releaseAs.text).toString()
        );
      }
      if (commit.breaking) {
        breaking++;
      } else if (commit.type === 'feat' || commit.type === 'feature') {
        features++;
      }
    }

    if (breaking > 0) {
      if (version.major < 1 && this.bumpMinorPreMajor) {
        return new PrereleaseMinorVersionUpdate(this.prereleaseType);
      } else {
        return new PrereleaseMajorVersionUpdate(this.prereleaseType);
      }
    } else if (features > 0) {
      if (version.major < 1 && this.bumpPatchForMinorPreMajor) {
        return new PrereleasePatchVersionUpdate(this.prereleaseType);
      } else {
        return new PrereleaseMinorVersionUpdate(this.prereleaseType);
      }
    }
    return new PrereleasePatchVersionUpdate(this.prereleaseType);
  }
}
