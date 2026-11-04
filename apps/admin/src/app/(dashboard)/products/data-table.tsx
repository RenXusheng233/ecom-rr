'use client'

import { useMemo, useState } from 'react'
import {
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
import type { AdminProductType } from '@repo/types'
import DeleteProducts from '@/components/DeleteProducts'
import { createColumns } from './columns'

export function DataTable({ data }: { data: AdminProductType[] }) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState({})
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [targets, setTargets] = useState<AdminProductType[]>([])
  const columns = useMemo(
    () =>
      createColumns((product) => {
        setTargets([product])
        setDeleteOpen(true)
      }),
    [],
  )

  const table = useReactTable({
    data,
    columns,
    getRowId: (product) => product.id.toString(),
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

  return (
    <div className="overflow-hidden rounded-md border">
      {table.getSelectedRowModel().rows.length > 0 && (
        <div className="flex justify-end">
          <Button
            size="sm"
            className="bg-red-500 text-white m-2 cursor-pointer hover:bg-red-600"
            onClick={() => {
              setTargets(
                table.getSelectedRowModel().rows.map((row) => row.original),
              )
              setDeleteOpen(true)
            }}
          >
            <Trash2 />
            Delete Product(s)
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
      {deleteOpen ? (
        <DeleteProducts
          products={targets}
          onOpenChange={setDeleteOpen}
          onResult={(result) => {
            const deleted = new Set(result.deletedIds.map(String))
            setRowSelection((previous) =>
              Object.fromEntries(
                Object.entries(previous).filter(([id]) => !deleted.has(id)),
              ),
            )
            const failed = new Set(result.failures.map((product) => product.id))
            setTargets((previous) =>
              previous.filter((product) => failed.has(product.id)),
            )
          }}
        />
      ) : null}
    </div>
  )
}
