import re,json,hashlib
from decimal import Decimal
from pathlib import Path
import pymupdf
root=Path(__file__).resolve().parents[1]
def num(s):return float(s.replace('.','').replace(',','.').replace('(','-').replace(')',''))
products=[];docs=[];sellers={};pt={};dt={}
for kind,name in [('products','produtos 11-26'),('documents','vendedor 11-26')]:
 d=pymupdf.open('/Users/rei/Downloads/'+name+'.pdf'); seller=None
 for page,p in enumerate(d):
  for line in p.get_text(sort=True).splitlines():
   m=re.match(r'Vendedor: (\d{3})\s*-\s*(.*?)(?:\s+Sub-Total:.*)?$',line)
   if m:seller=m[1];sellers[seller]=m[2].strip()
   if kind=='products':
    m=re.match(r'(\d{6})-(.*?)\s+(KG|SC)\s+(.*?)\s+([\d.,()\-]+)\s+([\d.,\-]+)\s+([\d.,\-]+)\s*$',line)
    if m:
     code,label,unit,middle,q,avg,value=m.groups();manufacturer='QUALINUTRI' if middle.startswith('QUALINUTRI') else ''
     products.append(dict(seller=seller,code=code,name=label.strip(),unit=unit,manufacturer=manufacturer,group=middle.removeprefix('QUALINUTRI').strip(),quantity=num(q),historicalAverage=num(avg),value=num(value),page=page+1))
    if 'Sub-Total:' in line:
     vals=re.findall(r'-?\d[\d.]*,\d+|\(\d[\d.]*,\d+\)',line.split('Sub-Total:')[1]);pt[seller]=list(map(num,vals))
   else:
    m=re.match(r'([CF]\d{6})\s+(.*?)(\d{7})\s+(?:(\w+)\s+)?(\d{2}/\d{2}/\d{2})\s+(\d{3})\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})(?:\s+(\S+))?\s*$',line)
    if m:
     customer,name2,doc,series,date,sid,gross,discount,expense,net,status=m.groups(); day,month,year=date.split('/')
     docs.append(dict(seller=sid,customerCode=customer,customer=name2.strip(),document=doc,series=series or '',date=f'20{year}-{month}-{day}',gross=num(gross),discount=num(discount),expense=num(expense),net=num(net),status=status or '',page=page+1))
    if line.startswith('Totais de '):
     sid=re.search(r'Totais de (\d{3})',line)[1];vals=re.findall(r'-?\d[\d.]*,\d+|(?<=\s)\d+(?=\s)',line.split(' - ',1)[1]);dt[sid]=list(map(num,vals[-6:]))
# EV for doc 0005783 printed at end of preceding page
for row in docs:
 if row['document']=='0005783':row['series']='EV';row['seriesNote']='Série impressa no fim da página 3; documento na página 4.'
# Nomes completos: o relatório corta o texto na coluna, mas o texto inteiro está no PDF.
# Lê sem o recorte e só substitui quando o completo começa exatamente pelo cortado.
full_names={};full_groups=set()
for name in ['vendedor 11-26','produtos 11-26']:
 for p in pymupdf.open('/Users/rei/Downloads/'+name+'.pdf'):
  for line in p.get_text(sort=True,flags=pymupdf.TEXTFLAGS_TEXT&~pymupdf.TEXT_MEDIABOX_CLIP).splitlines():
   # o fim do nome longo transborda para depois do documento: "FAZENDA0005802VACA BAIA EV  09/11/26"
   m=re.match(r'([CF]\d{6})\s+(.+?)\s*(\d{7})([A-ZÀ-Ú .\-]*?)\s*(?:1|EV|DV|VF)?\s+\d{2}/\d{2}/\d{2}',line)
   if m and name.startswith('vendedor'):full_names[(m[1],m[3])]=re.sub(r'\s+',' ',(m[2]+' '+m[4]).strip())
   g=re.search(r'\b(PROTEICOS ENERGETICOS|SUPLEMENTO MINERAL|MINERAIS ADENSADOS)\b',line)
   if g:full_groups.add(g[1])
for row in docs:
 full=full_names.get((row['customerCode'],row['document']))
 if full and full!=row['customer'] and full.startswith(row['customer']):row['customerFull']=full
for row in products:
 full=next((g for g in full_groups if g!=row['group'] and g.startswith(row['group'])),None)
 if full:row['groupFull']=full
data=dict(period={'start':'2026-11-01','end':'2026-11-13'},sellers=sellers,products=products,documents=docs,productTotals=pt,documentTotals=dt,sources=[dict(file=n+'.pdf',sha256=hashlib.sha256(Path('/Users/rei/Downloads/'+n+'.pdf').read_bytes()).hexdigest(),pages=c) for n,c in [('produtos 11-26',3),('vendedor 11-26',4)]])
(root/'src/demo/history/november2026.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
print('products',len(products),'unique',len(set(r['code'] for r in products)),'docs',len(docs),'sellers',len(sellers))
for sid in sellers:
 ps=[r for r in products if r['seller']==sid];ds=[r for r in docs if r['seller']==sid]
 print(sid,sellers[sid], 'KG',sum(r['quantity'] for r in ps if r['unit']=='KG'),'SC',sum(r['quantity'] for r in ps if r['unit']=='SC'),'products',round(sum(r['value'] for r in ps),2),pt.get(sid),'docs',len(ds),[round(sum(r[k] for r in ds),2) for k in ['gross','discount','expense','net']],dt.get(sid))
print('TOTAL',sum(r['quantity'] for r in products if r['unit']=='KG'),sum(r['quantity'] for r in products if r['unit']=='SC'),round(sum(r['value'] for r in products),2),[round(sum(r[k] for r in docs),2) for k in ['gross','discount','expense','net']])
