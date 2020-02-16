import { AzureFunction } from '@azure/functions'

const body = {
  times: 0,
  version: '0.0.0',
  fullUrls: [],
  asarUrls: []
}

const fn: AzureFunction = ctx => {
  ctx.res = { body }
}

export default fn
