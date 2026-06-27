from PIL import Image, ImageDraw
import os
def Hx(c): c=c.lstrip('#'); return (int(c[0:2],16),int(c[2:4],16),int(c[4:6],16),255)
OUT=Hx('#0d1016'); W,Hh=22,34
def newc(): im=Image.new('RGBA',(W,Hh),(0,0,0,0)); return im, ImageDraw.Draw(im)
def R(d,x0,y0,x1,y1,c): d.rectangle([x0,y0,x1,y1],fill=c)
def outline(im,col=OUT):
    px=im.load(); w,hh=im.size; out=im.copy(); o=out.load()
    for y in range(hh):
        for x in range(w):
            if px[x,y][3]==0:
                for dx,dy in((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)):
                    nx,ny=x+dx,y+dy
                    if 0<=nx<w and 0<=ny<hh and px[nx,ny][3]>0: o[x,y]=col;break
    return out
def shades(hexc):
    c=Hx(hexc); d=tuple(max(0,int(v*0.72)) for v in c[:3])+(255,); l=tuple(min(255,int(v*1.2)) for v in c[:3])+(255,); return c,d,l
FACE=Hx('#2b2f3a'); EYE=Hx('#5a6680'); LEG=Hx('#1d212a'); BOOT=Hx('#13161c'); WOOD=Hx('#5f4630'); BLADE=Hx('#cdd6e1'); GOLD=Hx('#cf9a38')
CFG={
 'warrior':dict(cloak='#8a93a8', accent='#a83232', weapon='sword'),
 'paladin':dict(cloak='#d7d3c4', accent='#cf9a38', weapon='bow'),
 'mage':   dict(cloak='#37707a', accent='#9bef5a', weapon='staff', orb='#9bef5a'),
 'druid':  dict(cloak='#436a3c', accent='#caa46a', weapon='staff', orb='#8fd47a', antler=True),
 'priest': dict(cloak='#e2ddcd', accent='#cf9a38', weapon='holy', orb='#ffe39a'),
}
def draw(cls,direction,state,frame):
    cfg=CFG[cls]; im,d=newc()
    cl,cld,cll=shades(cfg['cloak']); acc=Hx(cfg['accent'])
    if state=='walk': phase=frame%4; bob=-1 if phase in(1,3) else 0; sway=1 if phase in(0,1) else -1
    elif state=='idle': bob=0 if frame==0 else -1; sway=0; phase=-1
    else: bob=0; sway=0; phase=-1
    hy=3+bob; ty=12+bob; atk=(state=='attack')
    # ---- legs (long, thin) ----
    if direction in('down','up'):
        if phase==0: l1,l2=24,29
        elif phase==2: l1,l2=29,24
        else: l1=l2=27
        R(d,9,21,10,l1+3,LEG); R(d,9,l1+2,10,l1+3,BOOT)
        R(d,12,21,13,l2+3,LEG); R(d,12,l2+2,13,l2+3,BOOT)
    else: # side — stronger stride
        if phase in(0,1): R(d,12,21,13,31,LEG); R(d,9,21,10,27,LEG); R(d,12,30,14,31,BOOT); R(d,9,26,11,27,BOOT)
        elif phase in(2,3): R(d,9,21,10,31,LEG); R(d,12,21,13,28,LEG); R(d,8,30,10,31,BOOT); R(d,12,27,14,28,BOOT)
        else: R(d,10,21,11,31,LEG); R(d,12,21,13,30,LEG); R(d,9,30,14,31,BOOT)
    # ---- cloak body (slim, elongated, flares near bottom) ----
    top=ty
    for i,yy in enumerate(range(top,25)):
        wexp=max(0,(i-4))//2
        R(d,8-wexp,yy,14+wexp,yy,cl)
    R(d,7,23,15,24,cld)
    R(d,7+(1 if sway>0 else 0),24,9,25,cl); R(d,13-(1 if sway<0 else 0),24,15,25,cl)
    R(d,8,top,14,top+1,cll)
    if direction!='up':
        ax=12; R(d,ax,18,ax+1,18,acc); R(d,ax+1,19,ax+2,19,acc); R(d,ax,20,ax+1,20,acc)
    # ---- hood ----
    R(d,8,hy+1,14,hy+9,cl); R(d,9,hy-1,13,hy+2,cl); R(d,10,hy-2,12,hy,cl)
    R(d,8,hy+5,9,hy+9,cll); R(d,13,hy+5,14,hy+9,cld)
    if cfg.get('antler'):
        R(d,7,hy-2,8,hy+2,WOOD); R(d,14,hy-2,15,hy+2,WOOD); R(d,6,hy-3,7,hy-1,WOOD); R(d,15,hy-3,16,hy-1,WOOD)
    if direction=='down':
        R(d,10,hy+4,13,hy+9,FACE); R(d,10,hy+5,10,hy+6,EYE); R(d,12,hy+5,12,hy+6,EYE)
    elif direction=='up':
        R(d,9,hy+3,13,hy+9,cld)   # solid back of hood
    else:
        R(d,12,hy+4,14,hy+9,FACE); R(d,13,hy+5,13,hy+6,EYE); R(d,8,hy+3,10,hy+9,cld)
    # ---- weapon ----
    wp=cfg['weapon']
    if wp=='sword':
        if direction=='down':
            if atk and frame==1: R(d,13,ty+6,20,ty+8,BLADE); R(d,19,ty+6,20,ty+8,Hx('#97a3b1'))
            elif atk and frame==0: R(d,15,hy+2,17,ty+2,BLADE)
            elif atk: R(d,15,ty+4,17,ty+9,BLADE)
            else: R(d,15,ty+2,16,ty+10,BLADE); R(d,15,ty+10,16,ty+11,GOLD)
        elif direction=='up':
            if atk and frame==1: R(d,3,ty+4,9,ty+6,BLADE)
            else: R(d,6,hy+2,7,ty+6,BLADE)
        else:
            if atk and frame==1: R(d,14,ty+4,21,ty+6,BLADE); R(d,20,ty+4,21,ty+6,Hx('#97a3b1'))
            elif atk and frame==0: R(d,14,hy+2,16,ty+2,BLADE)
            elif atk: R(d,14,ty+5,16,ty+10,BLADE)
            else: R(d,14,ty+2,15,ty+10,BLADE); R(d,14,ty+10,15,ty+11,GOLD)
    elif wp in('staff','holy'):
        orb=Hx(cfg.get('orb','#9bef5a')); sx=16 if direction!='up' else 5; topy=hy if not atk else hy-2
        R(d,sx,topy,sx+1,ty+11,WOOD)
        if wp=='holy': R(d,sx-1,topy-1,sx+2,topy+1,GOLD); R(d,sx,topy-3,sx+1,topy+2,GOLD)
        else: R(d,sx-1,topy-2,sx+2,topy+1,orb)
        if atk: R(d,sx-2,topy-3,sx+3,topy+2,orb)
    elif wp=='bow':
        bx=16 if direction!='up' else 5
        R(d,bx,ty-1,bx+1,ty+10,WOOD); R(d,bx-1,ty-1,bx,ty,WOOD); R(d,bx-1,ty+9,bx,ty+10,WOOD); R(d,bx-1,ty+1,bx,ty+8,Hx('#caa46a'))
        if atk and frame==1:
            if direction=='down': R(d,bx-1,ty+11,bx,ty+15,BLADE)
            elif direction=='up': R(d,bx,ty-5,bx+1,ty-1,BLADE)
            else: R(d,bx+1,ty+4,bx+6,ty+5,BLADE)
        elif atk: R(d,bx-2,ty+4,bx,ty+5,BLADE)
    return outline(im)

FC={'idle':2,'walk':4,'attack':3}
OUTDIR="/home/claude/mithralda/assets/class"; os.makedirs(OUTDIR,exist_ok=True)
for cls in CFG:
    for dirn in('down','up','side'):
        for st,n in FC.items():
            strip=Image.new('RGBA',(W*n,Hh))
            for f in range(n): strip.alpha_composite(draw(cls,dirn,st,f),(f*W,0))
            strip.save(f"{OUTDIR}/{cls}_{st}_{dirn}.png")
print("elongated cloak strips built  (fh=%d)"%Hh)
# contact: warrior + mage all dirs/states to inspect side walk + up
sc=5
def row(cls,specs):
    return specs
specs=[('down','idle',0),('side','walk',0),('side','walk',1),('side','walk',2),('side','walk',3),('up','idle',0),('down','attack',1)]
classes=list(CFG.keys())
sheet=Image.new('RGBA',(len(specs)*(W*sc+6)+92, len(classes)*(Hh*sc+10)+8),(40,40,46,255)); dr=ImageDraw.Draw(sheet)
for ri,cls in enumerate(classes):
    y=6+ri*(Hh*sc+10); dr.text((3,y+70),cls,fill=(232,224,208,255))
    for ci,(dirn,st,f) in enumerate(specs):
        sp=draw(cls,dirn,st,f).resize((W*sc,Hh*sc),Image.NEAREST); sheet.alpha_composite(sp,(88+ci*(W*sc+6),y))
        if ri==0: dr.text((88+ci*(W*sc+6),0),f"{dirn[:1]}/{st[:1]}{f}",fill=(150,160,170,255))
sheet.save('/home/claude/chibi/_cloak2.png'); print("contact",sheet.size)
