import { message } from '@/_helpers/browser-api'

export const cancelTranslation = (sessionId: string) =>
  message.send<'MILO_CANCEL_TRANSLATION'>({
    type: 'MILO_CANCEL_TRANSLATION',
    payload: { sessionId }
  })
