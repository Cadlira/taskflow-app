import path from 'node:path'

export type FoundationProfile = 'dev' | 'test' | 'prod'

export interface ProfilePaths {
  root: string
  userData: string
  sessionData: string
}

export function selectFoundationProfile(
  isPackaged: boolean,
  argv: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
): FoundationProfile {
  if (isPackaged) {
    return argv.filter((argument) => argument === '--foundation-test').length === 1 ? 'test' : 'prod'
  }
  return environment['TASKFLOW_PROFILE'] === 'test' ? 'test' : 'dev'
}

export function resolveProfilePaths(localAppData: string | undefined, profile: FoundationProfile): ProfilePaths {
  if (typeof localAppData !== 'string' || !path.win32.isAbsolute(localAppData)) {
    throw new Error('Local application data folder is unavailable')
  }

  const normalizedRoot = path.win32.resolve(localAppData)
  if (normalizedRoot.startsWith('\\\\') || normalizedRoot.startsWith('\\?\\')) {
    throw new Error('Local application data folder is not a local path')
  }

  const root = path.win32.join(normalizedRoot, 'TaskFlowApp', 'profiles', profile)
  return {
    root,
    userData: path.win32.join(root, 'user-data'),
    sessionData: path.win32.join(root, 'session-data'),
  }
}

/** Banco de produto do perfil: `<userData>/data/taskflow.sqlite`, separado da prova e da sessão. */
export function resolveProductDatabaseFile(userData: string): string {
  return path.win32.join(userData, 'data', 'taskflow.sqlite')
}

/** Banco fictício do diagnóstico: `<userData>/foundation-proof/proof.sqlite`. */
export function resolveFoundationProofFile(userData: string): string {
  return path.win32.join(userData, 'foundation-proof', 'proof.sqlite')
}
