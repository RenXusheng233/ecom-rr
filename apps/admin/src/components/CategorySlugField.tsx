'use client'

import type { CategoryFormSchema } from '@repo/types'
import { CATEGORY_PRESETS } from '@repo/types/category'
import { Check, ChevronDown } from 'lucide-react'
import type { Control } from 'react-hook-form'
import type { z } from 'zod'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './ui/form'
import { Input } from './ui/input'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

export default function CategorySlugField({
  control,
  disabled,
  description = 'Choose a preset or enter a custom slug. Keep the current slug to preserve existing storefront links.',
}: {
  control: Control<z.infer<typeof CategoryFormSchema>>
  disabled?: boolean
  description?: string
}) {
  return (
    <FormField
      control={control}
      name="slug"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Slug</FormLabel>
          <div className="relative">
            <FormControl>
              <Input {...field} disabled={disabled} className="pr-10" />
            </FormControl>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  className="absolute right-0 top-0 size-9 rounded-l-none border-l"
                  aria-label="Choose a preset category slug"
                >
                  <ChevronDown className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuLabel>Preset categories</DropdownMenuLabel>
                {CATEGORY_PRESETS.map((slug) => (
                  <DropdownMenuItem
                    key={slug}
                    onSelect={() => {
                      field.onChange(slug)
                      field.onBlur()
                    }}
                  >
                    <Check
                      className={field.value === slug ? '' : 'opacity-0'}
                      aria-hidden="true"
                    />
                    {slug}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <FormDescription>{description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
