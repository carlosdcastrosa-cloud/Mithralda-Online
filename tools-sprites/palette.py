from PIL import Image, ImageDraw, ImageFont
import importlib.util, os
spec=importlib.util.spec_from_file_location("gc","/home/claude/chibi/gen_cloak.py")
gc=importlib.util.module_from_spec(spec)
# prevent it from rebuilding/saving strips on import by stubbing? It saves on import. That's harmless (same files). Allow.
spec.loader.exec_module(gc)
CFG=gc.CFG; draw=gc.draw; Hx=gc.Hx; shades=gc.shades
NAMES={'warrior':'GUERRERO','paladin':'PALADÍN','mage':'MAGO','druid':'DRUIDA','priest':'SACERDOTE'}
DESC={'warrior':'Espada y escudo','paladin':'Arco sagrado','mage':'Orbes arcanos','druid':'Naturaleza','priest':'Luz sagrada'}
classes=list(CFG.keys())
def label_colors(cls):
    cfg=CFG[cls]; cols=[('Capa',cfg['cloak']),('Acento',cfg['accent'])]
    if 'orb' in cfg: cols.append(('Orbe',cfg['orb']))
    return cols
SC=7; cw=210; rowh=Hh=gc.Hh*SC+10
BG=(34,37,44,255); PANEL=(44,48,57,255)
W=cw*1+560; 
rows=len(classes)
img=Image.new('RGBA',(770, 60+rows*150),(28,30,36,255)); d=ImageDraw.Draw(img)
try: f1=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",20); f2=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",13); f3=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",12)
except: f1=f2=f3=ImageFont.load_default()
d.text((24,18),"MITHRALDA — Paleta de clases",fill=(214,162,56,255),font=f1)
y0=58
for i,cls in enumerate(classes):
    y=y0+i*150
    d.rectangle([16,y,754,y+138],fill=(40,43,51,255),outline=(60,64,74,255),width=2)
    # sprites: down idle + side + up
    for j,(dirn) in enumerate(['down','side','up']):
        sp=draw(cls,dirn,'idle',0).resize((gc.W*5,gc.Hh*5),Image.NEAREST)
        img.alpha_composite(sp,(28+j*72, y+18))
    # name + desc
    d.text((250,y+16),NAMES[cls],fill=(232,224,208,255),font=f1)
    d.text((250,y+44),DESC[cls],fill=(150,160,170,255),font=f2)
    # color swatches with hex
    cols=label_colors(cls); sx=250; sy=y+74
    for k,(lab,hexc) in enumerate(cols):
        cx=sx+k*165
        d.rectangle([cx,sy,cx+30,sy+30],fill=Hx(hexc),outline=(20,22,28,255),width=2)
        d.text((cx+38,sy+1),lab,fill=(200,200,205,255),font=f3)
        d.text((cx+38,sy+15),hexc.upper(),fill=(150,155,162,255),font=f3)
img.save('/home/claude/chibi/_palette.png'); print("palette saved", img.size)
