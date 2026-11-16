import { Node, mergeAttributes } from '@tiptap/core'

const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  parseHTML: () => [{ tag: 'aside[data-editwell-callout]' }],
  renderHTML: ({ HTMLAttributes }) => ['aside', mergeAttributes(HTMLAttributes, { 'data-editwell-callout': '' }), 0],
  addCommands() {
    return {
      toggleCallout: () => ({ commands }) => commands.toggleWrap(this.name),
    }
  },
})

export const callout = {
  name: 'callout',
  extensions: [Callout],
  controls: {
    callout: {
      label: 'Callout',
      icon: 'ⓘ',
      run: editor => editor.chain().focus().toggleCallout().run(),
      enabled: editor => editor.can().toggleCallout(),
      active: editor => editor.isActive('callout'),
    },
  },
}
