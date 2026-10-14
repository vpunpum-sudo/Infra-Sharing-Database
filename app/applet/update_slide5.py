with open('src/components/DesignApprovalModal.tsx', 'r') as f:
    content = f.read()

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
