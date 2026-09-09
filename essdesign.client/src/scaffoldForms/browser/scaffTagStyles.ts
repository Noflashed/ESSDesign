// Keep the iOS column proportions while giving every browser cell the same
// border-box width (TextInput otherwise has an intrinsic minimum width).
export function adaptScaffTagStyles(styles) {
 const column = (name, fraction) => ({
  ...styles[name], flex: undefined, flexGrow: 0, flexShrink: 0,
  flexBasis: `${fraction * 100}%`, width: `${fraction * 100}%`, minWidth: 0,
  boxSizing: 'border-box'
 });
 return {...styles,
  tagMainTitle: {...styles.tagMainTitle, fontFamily: '"Avenir Next", Helvetica, Arial, sans-serif'},
  authDateCell: column('authDateCell', .8 / 3.9),
  authTimeCell: column('authTimeCell', .8 / 3.9),
  authNameCell: column('authNameCell', 1.1 / 3.9),
  authSignatureCell: column('authSignatureCell', 1.2 / 3.9),
  reverseDateCell: column('reverseDateCell', .7 / 2.6),
  reversePersonCell: column('reversePersonCell', 1.9 / 2.6)
 };
}
