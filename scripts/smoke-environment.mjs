// Layout isolado do smoke: todos os roots/perfis/filhos do smoke vivem sob um único
// diretório temporário próprio. Nenhum caminho pessoal ou de perfil preexistente é
// calculado aqui; o ambiente dos filhos recebe LOCALAPPDATA fictício e o perfil `dev`
// não é ativado por variável (o pacote só usa `test` com --foundation-test).
import path from 'node:path'

const RELATIVE_LAYOUT = {
  localAppData: 'local-app-data',
  profiles: 'local-app-data/TaskFlowApp/profiles',
  testProfileRoot: 'local-app-data/TaskFlowApp/profiles/test',
  prodProfileRoot: 'local-app-data/TaskFlowApp/profiles/prod',
  testUserData: 'local-app-data/TaskFlowApp/profiles/test/user-data',
  testProfileProof: 'local-app-data/TaskFlowApp/profiles/test/user-data/foundation-proof/proof.sqlite',
  productDatabase: 'local-app-data/TaskFlowApp/profiles/test/user-data/data/taskflow.sqlite',
  prodSentinelFile: 'local-app-data/TaskFlowApp/profiles/prod/sentinel.json',
}

export const PROD_SENTINEL = { fixture: 'TFA012-PROD-SENTINEL', note: 'perfil prod fictício do smoke; nunca o perfil real' }

/** Cria o layout calculado de um smokeRoot absoluto e recusa qualquer escape do root. */
export function createSmokeEnvironment(smokeRoot) {
  if (typeof smokeRoot !== 'string' || !path.isAbsolute(smokeRoot)) throw new Error('SMOKE_ROOT_NOT_ABSOLUTE')
  const join = (relative) => path.join(smokeRoot, relative)
  const layout = {
    smokeRoot,
    localAppData: join(RELATIVE_LAYOUT.localAppData),
    profiles: join(RELATIVE_LAYOUT.profiles),
    testProfileRoot: join(RELATIVE_LAYOUT.testProfileRoot),
    prodProfileRoot: join(RELATIVE_LAYOUT.prodProfileRoot),
    testUserData: join(RELATIVE_LAYOUT.testUserData),
    testProfileProof: join(RELATIVE_LAYOUT.testProfileProof),
    productDatabase: join(RELATIVE_LAYOUT.productDatabase),
    prodSentinelFile: join(RELATIVE_LAYOUT.prodSentinelFile),
  }
  for (const [name, value] of Object.entries(layout)) {
    const escape = path.relative(smokeRoot, value)
    if (name !== 'smokeRoot' && (escape.startsWith('..') || path.isAbsolute(escape))) {
      throw new Error(`SMOKE_PATH_ESCAPE:${name}`)
    }
  }
  const childEnvironment = {
    LOCALAPPDATA: layout.localAppData,
    TASKFLOW_PROFILE: 'dev',
    ELECTRON_RENDERER_URL: 'http://127.0.0.1:9/',
  }
  // Guarda de efeito: o ambiente dos filhos jamais aponta para o LOCALAPPDATA real.
  const realLocalAppData = process.env.LOCALAPPDATA
  if (realLocalAppData !== undefined && childEnvironment.LOCALAPPDATA === realLocalAppData) {
    throw new Error('SMOKE_ENV_LEAKS_REAL_LOCALAPPDATA')
  }
  return { ...layout, childEnvironment }
}
