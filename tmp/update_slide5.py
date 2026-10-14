with open('src/components/DesignApprovalModal.tsx', 'r') as f:
    content = f.read()

old_block = '''                                         <td className="p-2 border-r border-slate-800 font-normal">BJ#1-{sldEnclosures.length}</td>'''

new_block1 = '''                                         <td className="p-2 border-r border-slate-800 font-normal">
                                           {routeEncs.length > 0
                                             ? `${parseEnclosureName(routeEncs[0], 0).bjNo} - ${parseEnclosureName(routeEncs[routeEncs.length - 1], routeEncs.length - 1).bjNo} (${routeEncs.length} หัว)`
                                             : `BJ#1-${sldEnclosures.length}`}
                                         </td>'''

new_block2 = '''                                     <td className="p-2 border-r border-slate-800 font-normal">
                                       {routeEncs.length > 0
                                         ? `${parseEnclosureName(routeEncs[0], 0).bjNo} - ${parseEnclosureName(routeEncs[routeEncs.length - 1], routeEncs.length - 1).bjNo} (${routeEncs.length} หัว)`
                                         : `BJ#1-${sldEnclosures.length}`}
                                     </td>'''

# Replace first occurrence in owner rows and second occurrence in spare row
parts = content.split('                                         <td className="p-2 border-r border-slate-800 font-normal">BJ#1-{sldEnclosures.length}</td>')
if len(parts) >= 3:
    content = new_block1.join(parts[:2]) + new_block1 + parts[2] # wait, parts has 3 items if 2 occurrences
    # Let's do it precisely:
    # First occurrence is ownerRows
    # Second occurrence is spare row
    pass

# Alternatively, replace by exact context or replace all occurrences with a helper expression or function call
content = content.replace(
    '                                         <td className="p-2 border-r border-slate-800 font-normal">BJ#1-{sldEnclosures.length}</td>',
    '''                                         <td className="p-2 border-r border-slate-800 font-normal">
                                           {routeEncs.length > 0
                                             ? `${parseEnclosureName(routeEncs[0], 0).bjNo} - ${parseEnclosureName(routeEncs[routeEncs.length - 1], routeEncs.length - 1).bjNo} (${routeEncs.length} หัว)`
                                             : `BJ#1-${sldEnclosures.length}`}
                                         </td>'''
)

with open('src/components/DesignApprovalModal.tsx', 'w') as f:
    f.write(content)

print('Successfully updated Slide 5 enclosures!')
