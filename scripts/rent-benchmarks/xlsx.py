import zipfile, xml.etree.ElementTree as ET, sys, json
def load(path):
    z=zipfile.ZipFile(path)
    ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    wb=ET.fromstring(z.read('xl/workbook.xml')); rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    rmap={r.get('Id'):r.get('Target') for r in rels}
    sheets=[(s.get('name'), rmap[s.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')]) for s in wb.find('m:sheets',ns)]
    ss=[''.join(t.text or '' for t in si.iter('{%s}t'%ns['m'])) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si',ns)] if 'xl/sharedStrings.xml' in z.namelist() else []
    out={}
    for name,target in sheets:
        root=ET.fromstring(z.read('xl/'+target.replace('/xl/','').lstrip('/')))
        rows=[]
        for row in root.iter('{%s}row'%ns['m']):
            cells=[]
            for c in row.findall('m:c',ns):
                v=c.find('m:v',ns); t=c.get('t'); val=None
                if v is not None: val=ss[int(v.text)] if t=='s' else v.text
                elif t=='inlineStr': val=''.join(x.text or '' for x in c.iter('{%s}t'%ns['m']))
                cells.append(val)
            rows.append(cells)
        out[name]=rows
    return out
if __name__=='__main__':
    d=load(sys.argv[1])
    for name in sys.argv[2:]:
        print('=====',name)
        for r in d[name]:
            vals=[str(x) for x in r if x not in (None,'')]
            if vals: print(' | '.join(vals)[:220])
