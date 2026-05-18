import { getBoolean, setBoolean } from '../local-storage'

export const useExternalCredentialHelperDefault = __LINUX__ ? true : false
export const useExternalCredentialHelperKey: string =
  'useExternalCredentialHelper'

export const useExternalCredentialHelper = () =>
  getBoolean(useExternalCredentialHelperKey, useExternalCredentialHelperDefault)

export const setUseExternalCredentialHelper = (value: boolean) =>
  setBoolean(useExternalCredentialHelperKey, value)
