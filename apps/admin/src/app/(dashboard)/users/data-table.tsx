'use client'

import { useState } from 'react'
import {
  ColumnDef,
  flexRender,
  SortingState,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
} from '@tanstack/react-table'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTablePagination } from '@/components/TablePagination'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { useAuth } from '@clerk/nextjs'
import { useMutation } from '@tanstack/react-query'
import { User } from '@clerk/nextjs/server'
import { toast } from 'react-toastify'
import { useRouter } from 'next/navigation'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
}

export function DataTable<TData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState({})

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      rowSelection,
    },
  })

  const { getToken } = useAuth()
  const router = useRouter()
  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken()
      const selectedRows = table.getSelectedRowModel().rows
      await Promise.all(
        selectedRows.map(async (row) => {
          const userId = (row.original as User).id
          await fetch(
            `${process.env.NEXT_PUBLIC_AUTH_SERVICE_URL}/users/${userId}`,
            {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          )
        }),
      )
    },
    onSuccess: () => {
      toast.success('User(s) deleted successfully')
      router.refresh()
      // FIXME: 删除成功后, rowSelection 没有清空, 需要手动清空
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`)
    },
  })

  return (
    <div className="overflow-hidden rounded-md border">
      {Object.keys(rowSelection).length > 0 && (
        <div className="flex justify-end">
          <Button
            size="sm"
            className="bg-red-500 text-white m-2 cursor-pointer hover:bg-red-600"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            <Trash2 />
            {mutation.isPending ? 'Deleting...' : 'Delete User(s)'}
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <DataTablePagination table={table} />
    </div>
  )
}
