import { calculateOutboxRetryMs } from './catalogSync'

type CatalogOutboxEvent = {
  id: string
  aggregateId: string
  attempts: number
  payload: object
}

type CatalogOutboxDependencies = {
  publish: (event: CatalogOutboxEvent) => Promise<void>
  markPublished: (eventId: string) => Promise<void>
  markFailedAttempt: (input: {
    eventId: string
    nextAttemptAt: Date
    error: string
  }) => Promise<void>
  now: () => Date
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

export const dispatchCatalogOutboxEvent = async (
  event: CatalogOutboxEvent,
  dependencies: CatalogOutboxDependencies,
) => {
  try {
    await dependencies.publish(event)
    await dependencies.markPublished(event.id)
  } catch (error) {
    const attempt = event.attempts + 1
    await dependencies.markFailedAttempt({
      eventId: event.id,
      nextAttemptAt: new Date(
        dependencies.now().getTime() + calculateOutboxRetryMs(attempt),
      ),
      error: errorMessage(error),
    })
  }
}
