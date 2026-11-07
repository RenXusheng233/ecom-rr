'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({
  children,
  scriptProps,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  // The server-rendered script applies the saved theme before hydration.
  const themeScriptProps =
    typeof window === 'undefined'
      ? scriptProps
      : { ...scriptProps, type: 'text/plain' }

  return (
    <NextThemesProvider {...props} scriptProps={themeScriptProps}>
      {children}
    </NextThemesProvider>
  )
}
