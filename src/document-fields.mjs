/* Maps a filled document_field row to the shape flatten.mjs's annotations
   expect. flatten.mjs is fixed/tested and not modified here -- field types
   it doesn't know about (number, dropdown) are drawn the same way as its
   'text' type, since that's exactly what they are once filled in.
   attachment fields are never drawn onto the page: an attachment is a
   supporting file the signer provides, not a mark on the document. */
export function toAnnotation(field) {
  const base = {
    page: field.page,
    x: field.x,
    y: field.y,
    w: field.w,
    h: field.h,
    z_index: field.sortOrder,
    rotation: 0,
    ink_color: '#1B3FA8',
  };

  switch (field.type) {
    case 'signature':
    case 'initials': {
      const strokes = field.strokeData;
      if (!Array.isArray(strokes) || strokes.length === 0) return null;
      return { ...base, type: 'ink', stroke_data: strokes, thickness: field.type === 'signature' ? 2 : 1.6 };
    }
    case 'checkbox':
      return { ...base, type: 'checkbox', value_text: field.valueText };
    case 'date':
    case 'fullname':
      return { ...base, type: field.type, value_text: field.valueText ?? '' };
    case 'text':
    case 'number':
    case 'dropdown':
      return { ...base, type: 'text', value_text: field.valueText ?? '' };
    case 'attachment':
      return null;
    default:
      return null;
  }
}
