-- =====================================================================
--  Kaderno v30: avisos en el idioma de cada persona.
--  Correr una vez en Supabase (SQL Editor), después de schema_v26.sql.
--
--  Los avisos (recordatorios, resúmenes, pagos, proyectos) se arman en
--  español en varias funciones. En vez de cambiarlas todas, un disparador
--  traduce el título y el texto al guardarlos en la bandeja cuando la
--  persona tiene la app en inglés (user_prefs.settings.lang = 'en').
--  Solo se traducen los textos fijos: lo que escribió la gente (títulos de
--  tareas, nombres de proyectos, comentarios) queda igual.
-- =====================================================================

create or replace function public.kd_lang(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select 'en' from public.user_prefs where user_id = p_user and settings ->> 'lang' = 'en'), 'es');
$$;

-- dd/mm -> mm/dd (en inglés va primero el mes).
create or replace function public._kd_md(s text) returns text language sql immutable as $$
  select regexp_replace(s, '(\d{2})/(\d{2})', '\2/\1', 'g');
$$;

-- Título y texto en inglés de un aviso. Devuelve los dos en un arreglo.
create or replace function public.kd_notif_en(p_kind text, p_title text, p_body text) returns text[]
language plpgsql immutable as $$
declare t text := p_title; b text := p_body;
begin
  case p_kind
  when 'reminder' then
    if b = 'Recordatorio' then b := 'Reminder';
    elsif b like 'Entrega: %' then b := 'Due: ' || public._kd_md(substr(b, 10)); end if;
  when 'project_due' then
    b := regexp_replace(b, ' · vence (\d{2})/(\d{2}) ', ' · due \2/\1 ');
  when 'daily' then
    if t = 'Hoy tienes 1 entrega' then t := '1 thing due today';
    elsif t ~ '^Hoy tienes \d+ entregas$' then t := regexp_replace(t, '^Hoy tienes (\d+) entregas$', '\1 things due today');
    elsif t = 'Tienes tareas vencidas' then t := 'You have overdue tasks'; end if;
    b := regexp_replace(b, '^(\d+) vencidas?\. ', '\1 overdue. ');
    b := replace(b, 'Abre Kaderno para ver tu día.', 'Open Kaderno to see your day.');
  when 'weekly' then
    if t = 'Tu semana en Kaderno' then t := 'Your week in Kaderno'; end if;
    b := regexp_replace(b, '^1 tarea hechas, ', '1 task done, ');
    b := regexp_replace(b, '^(\d+) tareas hechas, ', '\1 tasks done, ');
    b := regexp_replace(b, ' min de enfoque\. Esta semana vienen (\d+)\.$', ' min of focus. \1 coming up this week.');
  when 'assigned' then
    if t = 'Te asignaron una tarea' then t := 'You were assigned a task'; end if;
    b := regexp_replace(b, '^Proyecto: ', 'Project: ');
  when 'plan' then
    t := regexp_replace(t, '^Son las (.+?): toca ', 'It''s \1: time for ');
    b := replace(b, 'Toca para empezar el enfoque.', 'Tap to start focusing.');
    b := regexp_replace(b, '^En casa\. ', 'At home. ');
    b := regexp_replace(b, '^En la biblioteca\. ', 'At the library. ');
    b := regexp_replace(b, '^En la universidad\. ', 'At the university. ');
    b := regexp_replace(b, '^En la oficina\. ', 'At the office. ');
    b := regexp_replace(b, '^En la cafetería\. ', 'At the cafeteria. ');
    b := regexp_replace(b, '^En (.+)\. Tap', 'At \1. Tap');
  when 'semana' then
    if t = 'Planea tu semana' then t := 'Plan your week'; end if;
    if b = '3 minutos: lo importante de la semana y cuándo lo haces.' then b := '3 minutes: what matters this week and when you''ll do it.'; end if;
  when 'cierre' then
    if t = 'Cierra el día' then t := 'Close the day'; end if;
    if b = '1 minuto: lo que hiciste y lo que pasa a mañana.' then b := '1 minute: what you did and what moves to tomorrow.'; end if;
  when 'mention' then
    t := regexp_replace(t, ' te mencionó$', ' mentioned you');
    b := regexp_replace(b, '^Proyecto · ', 'Project · ');
  when 'comment' then
    t := regexp_replace(t, ' comentó en tu tarea$', ' commented on your task');
    b := regexp_replace(b, '^Proyecto · ', 'Project · ');
  when 'billing' then
    case t
    when 'Puestos agregados' then t := 'Seats added';
      b := regexp_replace(b, '^Tu equipo ahora tiene (\d+) puestos\.$', 'Your team now has \1 seats.');
    when 'Pago recibido' then t := 'Payment received';
      b := regexp_replace(b, '^Tienes Equipo hasta el ', 'You have Team until ');
      b := regexp_replace(b, '^Tienes Pro hasta el ', 'You have Pro until ');
      b := regexp_replace(b, '(\d{2})/(\d{2})/(\d{4})\. ¡Gracias por apoyar Kaderno!$', '\2/\1/\3. Thanks for supporting Kaderno!');
    when 'No pudimos renovar tu plan' then t := 'We couldn''t renew your plan';
      b := regexp_replace(b, '^Lo intentamos de nuevo en 1 día\. ', 'We''ll try again in 1 day. ');
      b := regexp_replace(b, '^Lo intentamos de nuevo en (\d+) días\. ', 'We''ll try again in \1 days. ');
      b := replace(b, 'Revisa tu medio de pago en Tu plan.', 'Check your payment method in Your plan.');
    when 'Se apagó la renovación' then t := 'Renewal turned off';
      if b = 'No pudimos cobrar después de 3 intentos. Puedes pagar otra vez cuando quieras; no se borra nada tuyo.' then
        b := 'We couldn''t charge after 3 tries. You can pay again anytime; nothing of yours is deleted.'; end if;
    when 'Tu prueba de Pro termina mañana' then t := 'Your Pro trial ends tomorrow';
      if b like 'Si te sirvió, puedes seguir con Pro desde %' then
        b := 'If it helped, you can keep Pro from $9.900 a month. If not, you go back to Free automatically and nothing is deleted.'; end if;
    when 'Tu plan termina pronto' then t := 'Your plan ends soon';
      b := regexp_replace(b, '^Termina el (\d{2})/(\d{2})\. Si quieres seguir, paga otro periodo en Tu plan\.$', 'It ends on \2/\1. To keep it, pay another period in Your plan.');
    else null;
    end case;
  when 'budget' then
    t := regexp_replace(t, '^Se acabó el presupuesto de (.*)$', '\1 is out of budget');
    t := regexp_replace(t, '^(.*) va en el 80 % del presupuesto$', '\1 has used 80% of its budget');
    b := regexp_replace(b, '^Van ([\d.]+) de ([\d.]+) horas\.$', '\1 of \2 hours used.');
  when 'timesheet' then
    t := regexp_replace(t, '^Horas para aprobar en ', 'Hours to approve in ');
    t := regexp_replace(t, '^Aprobaron tus horas en ', 'Your hours were approved in ');
    t := regexp_replace(t, '^Te devolvieron las horas de ', 'Your hours were sent back in ');
    b := regexp_replace(b, '^Alguien mandó ', 'Someone mandó ');
    b := regexp_replace(b, ' mandó ([\d.]+) h de la semana del (\d{2})/(\d{2})\.$', ' submitted \1 h for the week of \3/\2.');
    b := regexp_replace(b, '^Semana del (\d{2})/(\d{2})', 'Week of \2/\1');
  when 'project_rule' then
    t := regexp_replace(t, '^Tarea nueva en ', 'New task in ');
    t := regexp_replace(t, '^Solicitud nueva en ', 'New request in ');
    t := regexp_replace(t, '^Ya puedes seguir con "(.*)"$', 'You can continue with "\1"');
    t := regexp_replace(t, '^Se venció "(.*)"$', '"\1" is overdue');
    t := regexp_replace(t, '^"(.*)" pasó a (.*)$', '"\1" moved to \2');
    t := regexp_replace(t, ': en curso$', ': on track');
    t := regexp_replace(t, ': en riesgo$', ': at risk');
    t := regexp_replace(t, ': atrasado$', ': behind');
    b := regexp_replace(b, '^Se terminó "(.*)", que la bloqueaba\.$', '"\1", which was blocking it, is done.');
    b := regexp_replace(b, '^En (.*)\.$', 'In \1.');
  else null;
  end case;
  return array[t, b];
end $$;

create or replace function public._notif_lang_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare tb text[];
begin
  if public.kd_lang(new.user_id) = 'en' then
    tb := public.kd_notif_en(new.kind, new.title, new.body);
    new.title := coalesce(tb[1], new.title);
    new.body := tb[2];
  end if;
  return new;
end $$;

drop trigger if exists notification_queue_lang_trg on public.notification_queue;
create trigger notification_queue_lang_trg before insert on public.notification_queue
  for each row execute function public._notif_lang_trg();

revoke all on function public.kd_lang(uuid) from public, anon, authenticated;
revoke all on function public._notif_lang_trg() from public, anon, authenticated;
