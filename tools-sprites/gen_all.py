from PIL import Image, ImageDraw
import os
def Hx(c): c=c.lstrip('#'); return (int(c[0:2],16),int(c[2:4],16),int(c[4:6],16),255)
OUT=Hx('#0e1218'); W,Hh=22,30
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
SKIN=Hx('#c89a68'); SKIND=Hx('#a3784c'); GOLD=Hx('#cf9a38'); BLADE=Hx('#cdd6e1')
LEG=Hx('#3c4350'); BOOT=Hx('#262b34'); WOOD=Hx('#6e4f33')

# class configs
def shades(hexc):
    c=Hx(hexc); d=tuple(max(0,int(v*0.7)) for v in c[:3])+(255,); l=tuple(min(255,int(v*1.25)) for v in c[:3])+(255,); return c,d,l
CFG={
 'warrior':dict(kind='armor', body='#6d7888', cape='#8d3636', weapon='sword', shield=True, head='helmet', accent=GOLD),
 'paladin':dict(kind='armor', body='#b7bcc6', cape='#e6e0cf', weapon='bow', shield=False, head='helmet', accent=GOLD),
 'mage':dict(kind='robe', body='#2f6e6e', cape='#274f4f', weapon='staff', orb='#9bef5a', shield=False, head='hood', accent=GOLD),
 'druid':dict(kind='robe', body='#41693c', cape='#34532f', weapon='staff', orb='#8fd47a', shield=False, head='hood', antler=True, accent='#caa46a'),
 'priest':dict(kind='robe', body='#e2ddcd', cape='#ccc5b1', weapon='holy', orb='#ffe39a', shield=False, head='hood', accent=GOLD),
}
def draw(cls,direction,state,frame):
    cfg=CFG[cls]; im,d=newc()
    body,bodyd,bodyl=shades(cfg['body']); cape,caped,capel=shades(cfg['cape'])
    acc = cfg['accent'] if isinstance(cfg['accent'],tuple) else Hx(cfg['accent'])
    if state=='walk': phase=frame%4; bob=-1 if phase in(1,3) else 0; sway=1 if phase in(0,1) else -1
    elif state=='idle': bob=-1 if frame==1 else 0; sway=0; phase=-1
    else: bob=0; sway=0; phase=-1
    cy=10+bob; ty=12+bob; hy=4+bob; atk=(state=='attack')
    robe=(cfg['kind']=='robe')
    # ---- cloak / robe-back (behind) ----
    if not robe:
        if direction=='up': R(d,6,cy,15,cy+15,cape); R(d,6,cy+11,15,cy+15,caped); R(d,7,cy,14,cy+2,capel)
        elif direction=='down':
            R(d,5,cy+1,8,cy+13+(1 if sway>0 else 0),cape); R(d,13,cy+1,16,cy+13+(1 if sway<0 else 0),cape)
            R(d,5,cy+10,8,cy+14,caped); R(d,13,cy+10,16,cy+14,caped)
        else: R(d,3,cy,9,cy+14,cape); R(d,3,cy+10,9,cy+15,caped); R(d,7,cy,9,cy+2,capel)
    # ---- legs / robe ----
    if robe:
        # flowing robe skirt covering legs
        hemw=sway
        R(d,8,ty,14,ty+5,body)                      # upper robe
        # skirt trapezoid
        for i,yy in enumerate(range(ty+5,27)):
            wexp=i//2
            R(d,8-wexp,yy,14+wexp,yy,body)
        R(d,6,25,16,26,bodyd)                        # hem
        R(d,7+hemw,26,9+hemw,27,body); R(d,13-hemw,26,15-hemw,27,body) # hem sway tips
        R(d,8,ty+5,14,ty+6,acc)                      # sash
        # tiny feet
        R(d,9,26,11,28,BOOT); R(d,12,26,14,28,BOOT)
    else:
        if direction in('down','up'):
            if phase==0: ly,ry=22,25
            elif phase==2: ly,ry=25,22
            else: ly=ry=24
            R(d,9,19,11,ly,LEG); R(d,9,ly-1,11,ly,BOOT); R(d,12,19,14,ry,LEG); R(d,12,ry-1,14,ry,BOOT)
        else:
            if phase in(0,1): R(d,9,19,11,25,LEG); R(d,12,19,14,23,LEG)
            elif phase in(2,3): R(d,9,19,11,23,LEG); R(d,12,19,14,25,LEG)
            else: R(d,10,19,12,25,LEG); R(d,11,19,13,24,LEG)
            R(d,9,24,14,25,BOOT)
        # torso armor
        R(d,8,ty,14,ty+8,body); R(d,8,ty+6,14,ty+8,bodyd); R(d,8,ty+4,14,ty+5,acc)
    # ---- head ----
    if cfg['head']=='helmet':
        R(d,8,hy,14,hy+8,body); R(d,8,hy,14,hy+1,bodyl); R(d,10,hy-2,11,hy+1,cape)
        if direction=='down': R(d,9,hy+3,13,hy+7,SKIN); R(d,9,hy+6,13,hy+7,SKIND); R(d,10,hy+4,10,hy+5,OUT); R(d,12,hy+4,12,hy+5,OUT)
        elif direction=='up': R(d,8,hy+3,14,hy+8,bodyd)
        else: R(d,11,hy+3,14,hy+7,SKIN); R(d,11,hy+6,14,hy+7,SKIND); R(d,13,hy+4,13,hy+5,OUT); R(d,8,hy+2,10,hy+8,bodyd)
    else: # hood
        R(d,8,hy+1,14,hy+9,body); R(d,9,hy-1,13,hy+2,body); R(d,10,hy-2,12,hy,body)  # pointed hood
        R(d,8,hy+1,9,hy+9,bodyd); R(d,13,hy+1,14,hy+9,bodyd)
        if cfg.get('antler'):
            R(d,7,hy-3,8,hy+1,WOOD); R(d,14,hy-3,15,hy+1,WOOD); R(d,6,hy-3,7,hy-2,WOOD); R(d,15,hy-3,16,hy-2,WOOD)
        if direction=='down': R(d,10,hy+4,13,hy+8,SKIN); R(d,10,hy+7,13,hy+8,SKIND); R(d,10,hy+5,11,hy+6,acc); R(d,12,hy+5,12,hy+6,acc)
        elif direction=='up': pass
        else: R(d,12,hy+4,14,hy+8,SKIN); R(d,13,hy+5,13,hy+6,acc); R(d,8,hy+2,10,hy+9,bodyd)
    # ---- weapon ----
    wp=cfg['weapon']
    if wp=='sword':
        if direction=='down':
            R(d,4,ty,7,ty+6,bodyd); R(d,4,ty,7,ty+1,bodyl); R(d,5,ty+2,6,ty+4,acc)
            if atk and frame==1: R(d,13,ty+5,20,ty+7,BLADE); R(d,19,ty+5,20,ty+7,Hx('#97a3b1'))
            elif atk and frame==0: R(d,15,hy+1,17,ty+3,BLADE)
            elif atk: R(d,15,ty+3,17,ty+7,BLADE)
            else: R(d,15,ty-1,17,ty+5,BLADE); R(d,15,ty+5,17,ty+6,acc)
        elif direction=='up':
            R(d,15,ty,18,ty+6,bodyd); R(d,15,ty,18,ty+1,bodyl)
            if atk and frame==1: R(d,3,ty+3,9,ty+5,BLADE)
            else: R(d,5,hy+1,7,ty+4,BLADE); R(d,5,ty+4,7,ty+5,acc)
        else:
            if cfg['shield']: R(d,6,ty+1,9,ty+6,bodyd); R(d,6,ty+1,9,ty+2,bodyl)
            if atk and frame==1: R(d,14,ty+3,21,ty+5,BLADE); R(d,20,ty+3,21,ty+5,Hx('#97a3b1'))
            elif atk and frame==0: R(d,14,hy+2,16,ty+3,BLADE)
            elif atk: R(d,14,ty+4,16,ty+7,BLADE)
            else: R(d,14,ty-1,16,ty+6,BLADE); R(d,14,ty+6,16,ty+7,acc)
        if cfg['shield'] and direction=='down': R(d,4,ty,7,ty+6,bodyd); R(d,4,ty,7,ty+1,bodyl); R(d,5,ty+2,6,ty+4,acc)
    elif wp in('staff','holy'):
        orb=Hx(cfg.get('orb','#9bef5a'))
        sx = 16 if direction!='up' else 5
        topy = hy-1 if not atk else hy-3
        R(d,sx,topy,sx+1,ty+7,WOOD)         # pole
        # topper
        if wp=='holy':
            R(d,sx-1,topy-1,sx+2,topy+1,acc); R(d,sx,topy-3,sx+1,topy+2,acc)  # cross
        else:
            R(d,sx-1,topy-2,sx+2,topy+1,orb)
        if atk:  # glow burst at topper
            R(d,sx-2,topy-3,sx+3,topy+2,orb)
        if direction=='up':  # mirror pole to left already sx=5
            pass
    elif wp=='bow':
        if direction=='up': bx=5
        else: bx=16
        # bow arc
        R(d,bx,ty-2,bx+1,ty+7,WOOD); R(d,bx-1,ty-2,bx,ty-1,WOOD); R(d,bx-1,ty+6,bx,ty+7,WOOD)
        R(d,bx-1,ty,bx,ty+5,Hx('#caa46a'))  # string area
        if atk and frame==1:  # arrow released
            if direction=='down': R(d,bx-1,ty+8,bx,ty+12,BLADE)
            elif direction=='up': R(d,bx,ty-6,bx+1,ty-2,BLADE)
            else: R(d,bx+1,ty+2,bx+5,ty+3,BLADE)
        elif atk:  # nocked
            R(d,bx-2,ty+2,bx,ty+3,BLADE)
    return outline(im)

FC={'idle':2,'walk':4,'attack':3}
OUTDIR="/home/claude/mithralda/assets/class"; os.makedirs(OUTDIR,exist_ok=True)
for cls in CFG:
    for dirn in('down','up','side'):
        for st,n in FC.items():
            strip=Image.new('RGBA',(W*n,Hh))
            for f in range(n): strip.alpha_composite(draw(cls,dirn,st,f),(f*W,0))
            strip.save(f"{OUTDIR}/{cls}_{st}_{dirn}.png")
print("all class strips built")
# contact sheet: each class, down-idle, side-walk(f1), down-attack(f1)
sc=5; classes=list(CFG.keys())
cols=[('down','idle',0),('down','walk',2),('side','walk',1),('up','idle',0),('down','attack',1),('side','attack',1)]
sheet=Image.new('RGBA',(len(cols)*(W*sc+6)+90, len(classes)*(Hh*sc+10)+6),(40,40,46,255)); dr=ImageDraw.Draw(sheet)
for ri,cls in enumerate(classes):
    y=4+ri*(Hh*sc+10); dr.text((2,y+50),cls,fill=(232,224,208,255))
    for ci,(dirn,st,f) in enumerate(cols):
        sp=draw(cls,dirn,st,f).resize((W*sc,Hh*sc),Image.NEAREST); sheet.alpha_composite(sp,(86+ci*(W*sc+6),y))
        if ri==0: dr.text((86+ci*(W*sc+6),0),f"{dirn}/{st}",fill=(150,160,170,255))
sheet.save('/home/claude/chibi/_allclasses.png'); print("contact saved",sheet.size)
