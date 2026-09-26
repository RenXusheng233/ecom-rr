'use client'

import { useState } from 'react'
import { Card } from './ui/card'
import { Checkbox } from './ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { ScrollArea } from './ui/scroll-area'
import { Button } from './ui/button'
import { CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { Calendar } from './ui/calendar'

const TodoList = () => {
  const [date, setDate] = useState<Date | undefined>(new Date())
  const [open, setOpen] = useState<boolean>(false)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <h1 className="text-lg font-medium mb-2 shrink-0">
        Todo List(Demo data)
      </h1>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button className="w-full shrink-0">
            <CalendarIcon />
            {date ? format(date, 'PPP') : <span>Pick a date</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-auto">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(date) => {
              setDate(date)
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      {/* LIST */}
      <ScrollArea className="mt-4 min-h-0 max-h-[400px] flex-1">
        <div className="flex flex-col gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <Card className="p-4" key={i}>
              <div className="flex items-center gap-4">
                <Checkbox id={`item${i}`} checked />
                <label
                  htmlFor={`item${i}`}
                  className="text-sm text-muted-foreground"
                >
                  How to speak English?
                </label>
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

export default TodoList
