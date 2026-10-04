export type FoundationRequest = Readonly<{
  version: 1
}>

export type FoundationSuccess = Readonly<{
  version: 1
  status: 'verified'
  appVersion: string
  electronVersion: string
  nodeVersion: string
  fingerprint: string
}>

export type FoundationFailureCode =
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'BUSY'
  | 'PROOF_UNAVAILABLE'

export type FoundationFailure = Readonly<{
  version: 1
  status: 'error'
  code: FoundationFailureCode
}>

export type FoundationResult = FoundationSuccess | FoundationFailure
