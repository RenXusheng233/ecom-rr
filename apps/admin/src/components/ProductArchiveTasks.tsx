'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ArchiveTaskIdentity,
  ProductDeletionStatus,
  ProductDeletionStatusPage,
} from '@repo/types'
import { toast } from 'react-toastify'
import { Button } from './ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'

const statusLabels: Record<ProductDeletionStatus['archiveStatus'], string> = {
  WAITING: 'Waiting for sync',
  PROCESSING: 'Archiving',
  ARCHIVED: 'Archived',
  FAILED: 'Failed',
  UNAVAILABLE: 'Status unavailable',
}

export default function ProductArchiveTasks() {
  const [cursors, setCursors] = useState<string[]>([])
  const cursor = cursors.at(-1)
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['product-deletions', cursor],
    queryFn: async (): Promise<ProductDeletionStatusPage> => {
      const params = new URLSearchParams()
      if (cursor) params.set('cursor', cursor)
      const response = await fetch(`/api/product-deletions?${params}`, {
        cache: 'no-store',
      })
      if (!response.ok)
        throw new Error('Deletion tasks could not be loaded. Please try again.')
      return response.json()
    },
    refetchInterval: (query) =>
      query.state.data?.tasks.some((task) =>
        ['WAITING', 'PROCESSING', 'UNAVAILABLE'].includes(task.archiveStatus),
      )
        ? 5000
        : false,
  })
  const retry = useMutation({
    mutationFn: async (task: ArchiveTaskIdentity) => {
      const response = await fetch('/api/product-deletions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: task.productId,
          taskId: task.taskId,
          catalogVersion: task.catalogVersion,
        }),
      })
      if (!response.ok) {
        const result = await response.json().catch(() => null)
        throw new Error(result?.error ?? 'The archive could not be retried.')
      }
    },
    onSuccess: () => toast.success('Stripe archive queued for retry.'),
    onError: (error) => toast.error(error.message),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['product-deletions'] })
    },
  })

  return (
    <section
      className="mt-8 space-y-4 pb-8"
      aria-labelledby="archive-tasks-title"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 id="archive-tasks-title" className="font-semibold">
            Stripe archive tasks
          </h2>
          <p className="text-sm text-muted-foreground">
            Deleted products remain here while Stripe archiving is tracked.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={query.isFetching}
          onClick={() => {
            void query.refetch()
          }}
        >
          {query.isFetching ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>
      {query.isPending ? (
        <p className="text-sm text-muted-foreground">
          Loading archive tasks...
        </p>
      ) : null}
      {query.error ? (
        <p role="alert" className="text-sm text-destructive">
          {query.error.message}
        </p>
      ) : null}
      {query.data ? (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product ID</TableHead>
                <TableHead>Deleted at</TableHead>
                <TableHead>Stripe archive</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.tasks.length ? (
                query.data.tasks.map((task) => (
                  <TableRow key={task.taskId}>
                    <TableCell>#{task.productId}</TableCell>
                    <TableCell>
                      <time dateTime={task.deletedAt}>
                        {new Date(task.deletedAt).toLocaleString()}
                      </time>
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          task.archiveStatus === 'ARCHIVED'
                            ? 'text-green-600'
                            : task.archiveStatus === 'FAILED'
                              ? 'text-destructive'
                              : 'text-muted-foreground'
                        }
                      >
                        {statusLabels[task.archiveStatus]}
                      </span>
                      {task.archiveError || task.dispatchError ? (
                        <p className="mt-1 max-w-sm whitespace-normal text-xs text-muted-foreground">
                          {task.archiveError ?? task.dispatchError}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {task.archiveStatus === 'FAILED' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retry.isPending}
                          onClick={() => retry.mutate(task)}
                        >
                          Retry archive
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-20 text-center">
                    No product deletions yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="flex justify-end gap-2 border-t p-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!cursors.length || query.isFetching}
              onClick={() => setCursors((previous) => previous.slice(0, -1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!query.data.nextCursor || query.isFetching}
              onClick={() => {
                if (query.data.nextCursor)
                  setCursors((previous) => [
                    ...previous,
                    query.data.nextCursor!,
                  ])
              }}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
