declare module 'markstream-react' {
  import { FC } from 'react'

  interface MarkdownRenderProps {
    content: string
    final?: boolean
    isDark?: boolean
    className?: string
    typewriter?: boolean
    smoothStreaming?: boolean | 'auto'
    htmlPolicy?: 'safe' | 'unsafe' | 'strip'
    [key: string]: any
  }

  const MarkdownRender: FC<MarkdownRenderProps>
  export default MarkdownRender
}

declare module 'markstream-react/index.css' {}
