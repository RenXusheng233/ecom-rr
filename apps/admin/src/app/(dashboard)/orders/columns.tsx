'use client'

import { cn } from '@/lib/utils'
import { ColumnDef } from '@tanstack/react-table'
import { ArrowUpDown, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import Link from 'next/link'
import { OrderType } from '@repo/types'

export const columns: ColumnDef<OrderType>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
  },
  { accessorKey: 'orderId', header: 'Order ID' },
  {
    accessorKey: 'email',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Email
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
  },
  {
    accessorKey: 'amountTotal',
    header: 'Amount',
    cell: ({ row }) => {
      const amount = Number(row.getValue('amountTotal'))
      const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: row.original.currency.toUpperCase(),
      }).format(amount / 100)

      return <div className="font-medium">{formatted}</div>
    },
  },
  {
    accessorKey: 'paymentStatus',
    header: 'Payment',
    cell: ({ row }) => {
      const status: OrderType['paymentStatus'] = row.getValue('paymentStatus')
      return (
        <div
          className={cn(
            `p-1 rounded-md w-max text-xs`,
            ['CREATING', 'OPEN', 'PROCESSING'].includes(status) &&
              'bg-yellow-500/40',
            status === 'SUCCEEDED' && 'bg-green-500/40',
            ['FAILED', 'CANCELED', 'EXPIRED'].includes(status) &&
              'bg-red-500/40',
          )}
        >
          {status}
        </div>
      )
    },
  },
  {
    accessorKey: 'refundStatus',
    header: 'Refund',
    cell: ({ row }) => {
      const status: OrderType['refundStatus'] = row.getValue('refundStatus')
      return (
        <div
          className={cn(
            'w-max rounded-md p-1 text-xs',
            status === 'NONE' && 'bg-muted',
            status === 'PARTIAL' && 'bg-orange-500/40',
            status === 'FULL' && 'bg-purple-500/40',
          )}
        >
          {status}
        </div>
      )
    },
  },
  {
    accessorKey: 'disputeStatus',
    header: 'Dispute',
    cell: ({ row }) => {
      const status: OrderType['disputeStatus'] = row.getValue('disputeStatus')
      return (
        <div
          className={cn(
            'w-max rounded-md p-1 text-xs',
            status === 'NONE' && 'bg-muted',
            status === 'OPEN' && 'bg-red-500/40',
            status === 'WON' && 'bg-green-500/40',
            status === 'LOST' && 'bg-red-700/40',
          )}
        >
          {status}
        </div>
      )
    },
  },
  {
    accessorKey: 'updatedAt',
    header: 'Updated',
    cell: ({ row }) => new Date(row.original.updatedAt).toLocaleString('en-US'),
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const order = row.original

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(order.orderId)}
            >
              Copy Order ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Link href={`/users/${order.userId}`}>View Customer</Link>
            </DropdownMenuItem>
            <DropdownMenuItem>View Order Details</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
