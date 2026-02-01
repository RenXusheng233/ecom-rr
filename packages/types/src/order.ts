import { OrderSchemaType } from '@repo/order-db'

export type OrderType = OrderSchemaType & {
  _id: string
}
