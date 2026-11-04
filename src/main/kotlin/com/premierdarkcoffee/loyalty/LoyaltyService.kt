package com.premierdarkcoffee.loyalty

import kotlinx.serialization.encodeToString

import kotlinx.serialization.json.*
import java.sql.Connection
import java.sql.Timestamp
import java.time.*
import java.util.Locale

class LoyaltyService(val db: Database, internal val pepper: String, val clock: Clock = Clock.systemUTC()) {
    val commercial = CommercialService(db, clock)
    var wallets = WalletService(this)
    private val dummyPassword = Security.password("dummy-password-never-used")
    private fun now() = clock.instant()
        internal fun audit(c: Connection, tenant: String, actor: String, action: String, target: String) {
        c.exec("INSERT INTO audit_events(id,tenant_id,actor_id,action,target_id) VALUES(?,?,?,?,?)",id(),tenant,actor,action,target)
    }
    fun rateLimit(key: String, limit: Int = 12) {
        val count = db.tx { c ->
            val bucket = now().epochSecond / 60
            c.exec("DELETE FROM rate_limits WHERE bucket < ?", bucket - 120)
            c.one("INSERT INTO rate_limits(key,bucket,count) VALUES(?,?,1) ON CONFLICT(key,bucket) DO UPDATE SET count=rate_limits.count+1 RETURNING count",Security.hash(key),bucket) { it.getInt(1) }!!
        }
        need(count <= limit,"RATE_LIMITED","Demasiados intentos. Vuelve a intentarlo en un minuto.",429)
    }
    fun staff(token: String): Staff = db.tx { c ->
        c.one("SELECT * FROM staff_tokens WHERE token_hash=? AND revoked_at IS NULL",Security.hash(token)) { Staff(it.getString("tenant_id"),it.getString("id"),it.getString("role"),it.getString("branch_id")) }
            ?: throw Problem(401,"UNAUTHORIZED","Acceso no autorizado.")
    }
    fun member(token: String): Member = db.tx { c ->
        c.one("SELECT * FROM member_sessions WHERE token_hash=? AND expires_at>?",Security.hash(token), Timestamp.from(now())) { Member(it.getString("tenant_id"),it.getString("member_id")) }
            ?: throw Problem(401,"UNAUTHORIZED","Inicia sesión nuevamente.")
    }
    fun logout(token: String) = db.tx { it.exec("DELETE FROM member_sessions WHERE token_hash=?",Security.hash(token)); obj("ok" to true) }
        internal fun tenant(c: Connection, slug: String): JsonObject = c.one("SELECT * FROM tenants WHERE slug=?",slug) {
        obj("id" to it.getString("id"),"name" to it.getString("name"),"slug" to it.getString("slug"),"currency" to it.getString("currency"),"timezone" to it.getString("timezone"))
    } ?: throw Problem(404,"NOT_FOUND","Negocio no encontrado.")
    fun publicTenant(slug: String) = db.tx { c -> tenant(c,slug).let { t -> obj("business" to t,"programs" to programs(c,t.getValue("id").jsonPrimitive.content),"rewards" to rewards(c,t.getValue("id").jsonPrimitive.content),"termsVersion" to "pilot-1", "pilot" to true) } }
        fun createTenant(input: NewTenant): JsonObject {
        input.firstBranch?.let { text(it.name); text(it.code, 40) }

        text(input.name); need(input.slug.matches(Regex("[a-z0-9][a-z0-9-]{2,59}")),"INVALID_SLUG","URL del negocio inválida.")
        // v001 supports currencies with two decimals only; amounts always use minor units.
        need(input.currency in setOf("USD","EUR","COP","PEN","MXN"),"UNSUPPORTED_CURRENCY","Moneda no admitida en esta versión.")
        try { ZoneId.of(input.timezone) } catch (_: Exception) { throw Problem(400,"INVALID_TIMEZONE","Zona horaria inválida.") }
        return db.tx { c ->
            val tenant = id(); val staffId = id(); val token = Security.token()
            c.exec("INSERT INTO tenants(id,name,slug,currency,timezone) VALUES(?,?,?,?,?)",tenant,input.name.trim(),input.slug,input.currency,input.timezone)
            c.exec("INSERT INTO staff_tokens(tenant_id,id,token_hash,role) VALUES(?,?,?,'OWNER')",tenant,staffId,Security.hash(token))
                        c.exec("INSERT INTO business_access(tenant_id) VALUES(?)", tenant)
            val firstBranchId = input.firstBranch?.let { branch ->
                val branchId = id()
                c.exec("INSERT INTO branches(tenant_id,id,name,code) VALUES(?,?,?,?)", tenant, branchId, branch.name.trim(), branch.code.trim())
                audit(c, tenant, "platform", "CREATE_BRANCH", branchId)
                branchId
            }
            audit(c,tenant,"platform","CREATE_TENANT",tenant)
            obj("tenantId" to tenant,"ownerToken" to token,"staffId" to staffId,"enrollmentPath" to "/join/${input.slug}", "firstBranchId" to firstBranchId)
        }
    }
    fun newStaff(s: Staff, input: NewStaff): JsonObject { s.owner(); need(input.role in setOf("OWNER","CASHIER"),"INVALID_ROLE","Rol inválido.")
        return db.tx { c ->
        commercial.requireActive(c, s.tenant);
        
            input.branchId?.let { branch(c,s.tenant,it) }
            need(input.role != "CASHIER" || input.branchId != null,"BRANCH_REQUIRED","Asigna una sucursal al cajero.")
            val token = Security.token(); val staffId = id()
            c.exec("INSERT INTO staff_tokens(tenant_id,id,token_hash,role,branch_id) VALUES(?,?,?,?,?)",s.tenant,staffId,Security.hash(token),input.role,input.branchId)
            audit(c,s.tenant,s.id,"CREATE_STAFF",staffId)
            obj("id" to staffId,"token" to token)
        }
    }
    fun revokeStaff(s: Staff, staffId: String): JsonObject { s.owner(); need(staffId != s.id,"SELF_REVOKE","No puedes revocar tu propia credencial.")
        return db.tx { c ->
            need(c.exec("UPDATE staff_tokens SET revoked_at=now() WHERE tenant_id=? AND id=? AND revoked_at IS NULL",s.tenant,uuid(staffId)) == 1,"NOT_FOUND","Credencial no encontrada.",404)
            audit(c,s.tenant,s.id,"REVOKE_STAFF",staffId); obj("ok" to true)
        }
    }
    fun newBranch(s: Staff, input: NewBranch): JsonObject { s.owner(); text(input.name); text(input.code,40)
        return db.tx { c ->
        commercial.requireActive(c, s.tenant);
         val branchId = id()
            c.exec("INSERT INTO branches(tenant_id,id,name,code) VALUES(?,?,?,?)",s.tenant,branchId,input.name.trim(),input.code.trim())
            audit(c,s.tenant,s.id,"CREATE_BRANCH",branchId); obj("id" to branchId,"name" to input.name)
        }
    }
        internal fun branch(c: Connection, tenant: String, branch: String) {
        uuid(branch)
        need(c.one("SELECT id FROM branches WHERE tenant_id=? AND id=?",tenant,branch) { it.getString(1) } != null,"NOT_FOUND","Sucursal no encontrada.",404)
    }
    private fun validateBranches(c: Connection, tenant: String, program: Program) {
        (program.branchIds + program.bonuses.flatMap { it.branchIds }).forEach { branch(c,tenant,it) }
    }
    fun newProgram(s: Staff, program: Program): JsonObject { s.owner(); program.validate()
        return db.tx { c ->
        commercial.requireActive(c, s.tenant);
         validateBranches(c,s.tenant,program); val programId = id()
            c.exec("INSERT INTO programs(tenant_id,id,kind,current_version) VALUES(?,?,?,1)",s.tenant,programId,program.kind.name)
            c.exec("INSERT INTO program_versions(tenant_id,program_id,version,config) VALUES(?,?,1,?::jsonb)",s.tenant,programId,json.encodeToString(program))
            audit(c,s.tenant,s.id,"CREATE_PROGRAM",programId); obj("id" to programId,"version" to 1)
        }
    }
    fun editProgram(s: Staff, programId: String, input: ProgramChange): JsonObject { s.owner(); uuid(programId); input.program.validate()
        return db.tx { c ->
        commercial.requireActive(c, s.tenant);
         validateBranches(c,s.tenant,input.program)
            val current = c.one("SELECT kind,current_version FROM programs WHERE tenant_id=? AND id=? FOR UPDATE",s.tenant,programId) { it.getString(1) to it.getInt(2) } ?: throw Problem(404,"NOT_FOUND","Programa no encontrado.")
            need(current.second == input.expectedVersion,"VERSION_CONFLICT","La promoción cambió; recarga antes de guardar.",409)
            need(current.first == input.program.kind.name,"UNIT_CHANGE_REQUIRES_NEW_PROGRAM","Crea otro programa para cambiar entre puntos, cashback o sellos; conserva el saldo anterior.",409)
            val version = current.second + 1
            c.exec("INSERT INTO program_versions(tenant_id,program_id,version,config) VALUES(?,?,?,?::jsonb)",s.tenant,programId,version,json.encodeToString(input.program))
            c.exec("UPDATE programs SET current_version=? WHERE tenant_id=? AND id=?",version,s.tenant,programId)
            audit(c,s.tenant,s.id,"EDIT_PROGRAM",programId); obj("id" to programId,"version" to version)
        }
    }
    fun saveReward(s: Staff, input: Reward, rewardId: String? = null, expectedVersion: Int? = null): JsonObject { s.owner(); uuid(input.programId); text(input.name); need(input.cost in 1..1_000_000_000,"INVALID_COST","Costo inválido.")
        return db.tx { c ->
        commercial.requireActive(c, s.tenant);
        
            need(c.one("SELECT id FROM programs WHERE tenant_id=? AND id=?",s.tenant,input.programId) { it.getString(1) } != null,"NOT_FOUND","Programa no encontrado.",404)
            val target = rewardId?.let(::uuid) ?: id()
            val version = if (rewardId == null) 1 else {
                val row = c.one("SELECT version,program_id FROM rewards WHERE tenant_id=? AND id=? FOR UPDATE",s.tenant,target) { it.getInt(1) to it.getString(2) } ?: throw Problem(404,"NOT_FOUND","Premio no encontrado.")
                need(row.first == expectedVersion,"VERSION_CONFLICT","El premio cambió; recarga antes de guardar.",409)
                need(row.second == input.programId,"IMMUTABLE_PROGRAM","Crea otro premio para cambiar de programa.",409)
                row.first + 1
            }
            if (rewardId == null) c.exec("INSERT INTO rewards(tenant_id,id,program_id,name,cost,active,version) VALUES(?,?,?,?,?,?,?)",s.tenant,target,input.programId,input.name.trim(),input.cost,input.active,version)
            else c.exec("UPDATE rewards SET name=?,cost=?,active=?,version=? WHERE tenant_id=? AND id=?",input.name.trim(),input.cost,input.active,version,s.tenant,target)
            c.exec("INSERT INTO reward_versions(tenant_id,reward_id,version,config) VALUES(?,?,?,?::jsonb)",s.tenant,target,version,json.encodeToString(input))
            audit(c,s.tenant,s.id,"SAVE_REWARD",target); obj("id" to target,"version" to version)
        }
    }
        internal fun session(c: Connection, member: Member): JsonObject {
        val token = Security.token(); val until = now().plusSeconds(7*86400)
        c.exec("DELETE FROM member_sessions WHERE expires_at<?", Timestamp.from(now()))
        c.exec("INSERT INTO member_sessions(token_hash,tenant_id,member_id,expires_at) VALUES(?,?,?,?)",Security.hash(token),member.tenant,member.id,
            Timestamp.from(until))
        return obj("token" to token,"expiresAt" to until,"memberId" to member.id)
    }
    fun enroll(slug: String, input: Enrollment): JsonObject {
        text(input.name,80); need(input.acceptedTerms,"CONSENT_REQUIRED","Debes aceptar las condiciones del piloto.")
        val password = Security.password(input.password)
        return db.tx { c -> val tenant = tenant(c,slug).getValue("id").jsonPrimitive.content
        commercial.requireActive(c, tenant);
        
            val identity = Security.identity(pepper,tenant,input.document); val member = id()
            need(c.one("SELECT id FROM members WHERE tenant_id=? AND identity_hash=?",tenant,identity) { it.getString(1) } == null,"ENROLLMENT_UNAVAILABLE","No se puede completar el registro. Si ya tienes tarjeta, inicia sesión.",409)
            c.exec("INSERT INTO members(tenant_id,id,identity_hash,password_hash,name,card_code,terms_version) VALUES(?,?,?,?,?,?,'pilot-1')",tenant,member,identity,password,input.name.trim(),Security.token())
            changed(c,tenant,member); audit(c,tenant,member,"ENROLL",member); session(c,Member(tenant,member))
        }
    }
    fun login(slug: String, input: Login): JsonObject {
        val row = db.tx { c -> val tenant = tenant(c,slug).getValue("id").jsonPrimitive.content
            c.one("SELECT id,password_hash FROM members WHERE tenant_id=? AND identity_hash=?",tenant,Security.identity(pepper,tenant,input.document)) { Triple(tenant,it.getString(1),it.getString(2)) }
        }
        val verified = Security.verify(input.password,row?.third ?: dummyPassword)
                need(row != null && row.third != null && verified,"UNAUTHORIZED","Documento o contraseña incorrectos.",401)
        return db.tx { c -> session(c,Member(row!!.first,row.second)) }
    }
        internal fun lockMember(c: Connection, tenant: String, memberId: String) {
        uuid(memberId)
        need(c.one("SELECT id FROM members WHERE tenant_id=? AND id=? FOR UPDATE",tenant,memberId) { it.getString(1) } != null,"NOT_FOUND","Cliente no encontrado.",404)
    }
        internal fun changed(c: Connection, tenant: String, memberId: String) {
        val revision = c.one("UPDATE members SET revision=revision+1 WHERE tenant_id=? AND id=? RETURNING revision",tenant,memberId) { it.getLong(1) }!!
        c.exec("INSERT INTO wallet_outbox(id,tenant_id,member_id,revision) VALUES(?,?,?,?)",id(),tenant,memberId,revision)
    }
        internal fun ledger(c: Connection, tenant: String, member: String, program: String, delta: Long, kind: String, reference: String, version: Int? = null) {
        c.exec("INSERT INTO balances(tenant_id,member_id,program_id) VALUES(?,?,?) ON CONFLICT DO NOTHING",tenant,member,program)
        need(c.exec("UPDATE balances SET available=available+? WHERE tenant_id=? AND member_id=? AND program_id=? AND available+?>=0",delta,tenant,member,program,delta) == 1,"INSUFFICIENT_BALANCE","Saldo insuficiente.",409)
        c.exec("INSERT INTO ledger(tenant_id,id,member_id,program_id,delta,kind,reference_id,program_version) VALUES(?,?,?,?,?,?,?,?)",tenant,id(),member,program,delta,kind,reference,version)
    }
        internal fun once(c: Connection, tenant: String, operation: String, key: String, payload: String, work: () -> JsonObject): JsonObject {
        need(key.matches(Regex("[A-Za-z0-9._:-]{8,100}")),"IDEMPOTENCY_REQUIRED","Envía Idempotency-Key de 8 a 100 caracteres.")
        c.rows("SELECT pg_advisory_xact_lock(hashtextextended(?,0))","idem:$tenant:$operation:$key") { true }
        val hash = Security.hash(payload)
        val saved = c.one("SELECT request_hash,response::text FROM idempotency WHERE tenant_id=? AND operation=? AND key=?",tenant,operation,key) { it.getString(1) to it.getString(2) }
        if (saved != null) {
            need(saved.first == hash,"IDEMPOTENCY_CONFLICT","Esta clave ya se usó con otros datos.",409)
            return JsonObject(json.parseToJsonElement(saved.second).jsonObject + ("replayed" to JsonPrimitive(true)))
        }
        val response = JsonObject(work() + ("replayed" to JsonPrimitive(false)))
        c.exec("INSERT INTO idempotency(tenant_id,operation,key,request_hash,response) VALUES(?,?,?,?,?::jsonb)",tenant,operation,key,hash,response.toString())
        return response
    }
    fun purchase(s: Staff, input: Purchase, key: String): JsonObject {
        uuid(input.memberId); uuid(input.branchId); s.at(input.branchId); text(input.receipt,100)
        need(input.amountMinor in 1..1_000_000_000,"INVALID_AMOUNT","Monto de compra inválido.")
        val normalized = input.copy(receipt=input.receipt.trim().uppercase(Locale.ROOT))
        return db.tx { c -> once(c,s.tenant,"purchase:${s.id}",key,json.encodeToString(normalized)) {
        commercial.requireActive(c, s.tenant);
        
            branch(c,s.tenant,input.branchId); lockMember(c,s.tenant,input.memberId); releaseExpired(c,s.tenant,input.memberId)
            val tenant = c.one("SELECT currency,timezone FROM tenants WHERE id=?",s.tenant) { it.getString(1) to ZoneId.of(it.getString(2)) }!!
            need(input.currency == tenant.first,"CURRENCY_MISMATCH","La moneda debe coincidir con la del negocio.")
            val duplicate = c.one("SELECT id FROM purchases WHERE tenant_id=? AND branch_id=? AND receipt=?",s.tenant,input.branchId,normalized.receipt) { it.getString(1) }
            need(duplicate == null,"DUPLICATE_RECEIPT","Este comprobante ya se registró en esta sucursal.",409)
            val purchase = id(); val at = now()
            c.exec("INSERT INTO purchases(tenant_id,id,member_id,branch_id,receipt,amount_minor,currency,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)",s.tenant,purchase,input.memberId,input.branchId,normalized.receipt,input.amountMinor,input.currency,s.id,
                Timestamp.from(at))
            // Lock the parent first, then read its immutable version in a new READ COMMITTED snapshot.
            // A joined locking query could miss a newly committed version after waiting on an editor.
            val lockedPrograms = c.rows("SELECT id,current_version FROM programs WHERE tenant_id=? ORDER BY id FOR SHARE",s.tenant) { it.getString(1) to it.getInt(2) }
            val earned = lockedPrograms.mapNotNull { (program,version) ->
                val config = c.one("SELECT config::text FROM program_versions WHERE tenant_id=? AND program_id=? AND version=?",s.tenant,program,version) { json.decodeFromString<Program>(it.getString(1)) }!!
                val amount = config.earn(input.amountMinor,input.branchId,at,tenant.second)
                if (amount == 0L) null else {
                    ledger(c,s.tenant,input.memberId,program,amount,"EARN",purchase,version)
                    obj("programId" to program,"version" to version,"kind" to config.kind,"amount" to amount)
                }
            }
            changed(c,s.tenant,input.memberId); audit(c,s.tenant,s.id,"PURCHASE",purchase)
            obj("purchaseId" to purchase,"earned" to earned,"recordedAt" to at)
        } }
    }
    private fun programs(c: Connection, tenant: String) = c.rows("SELECT p.id,p.current_version,v.config::text FROM programs p JOIN program_versions v ON v.tenant_id=p.tenant_id AND v.program_id=p.id AND v.version=p.current_version WHERE p.tenant_id=? ORDER BY p.id",tenant) { obj("id" to it.getString(1),"version" to it.getInt(2),"config" to json.parseToJsonElement(it.getString(3))) }
    private fun rewards(c: Connection, tenant: String) = c.rows("SELECT * FROM rewards WHERE tenant_id=? ORDER BY id",tenant) { obj("id" to it.getString("id"),"programId" to it.getString("program_id"),"name" to it.getString("name"),"cost" to it.getLong("cost"),"active" to it.getBoolean("active"),"version" to it.getInt("version")) }
    fun dashboard(s: Staff) = db.tx { c -> obj(
        "business" to c.one("SELECT * FROM tenants WHERE id=?",s.tenant) { obj("id" to s.tenant,"name" to it.getString("name"),"slug" to it.getString("slug"),"currency" to it.getString("currency"),"timezone" to it.getString("timezone")) },
        "role" to s.role, "branchId" to s.branch,
        "branches" to c.rows("SELECT * FROM branches WHERE tenant_id=? AND (?::text IS NULL OR id=?) ORDER BY name",s.tenant,s.branch,s.branch) { obj("id" to it.getString("id"),"name" to it.getString("name"),"code" to it.getString("code")) },
        "programs" to programs(c,s.tenant),"rewards" to rewards(c,s.tenant),
        "wallet" to obj("apple" to "PENDING_INTEGRATION","google" to "PENDING_INTEGRATION")) }
    fun lookup(s: Staff, input: Lookup): JsonObject {
        need((input.document == null) != (input.cardCode == null),"INVALID_LOOKUP","Usa documento o código de tarjeta.")
        return db.tx { c ->
            val member = if (input.document != null) c.one("SELECT id FROM members WHERE tenant_id=? AND identity_hash=?",s.tenant,Security.identity(pepper,s.tenant,input.document)) { it.getString(1) }
                else c.one("SELECT id FROM members WHERE tenant_id=? AND card_code=?",s.tenant,input.cardCode) { it.getString(1) }
            need(member != null,"NOT_FOUND","Cliente no encontrado.",404)
            lockMember(c,s.tenant,member!!); releaseExpired(c,s.tenant,member)
            audit(c,s.tenant,s.id,"LOOKUP_MEMBER",member)
            memberView(c,Member(s.tenant,member))
        }
    }
    fun card(member: Member) = db.tx { c -> lockMember(c,member.tenant,member.id); releaseExpired(c,member.tenant,member.id); memberView(c,member) }
    private fun memberView(c: Connection, member: Member): JsonObject = obj(
        "member" to c.one("SELECT id,name,card_code,revision FROM members WHERE tenant_id=? AND id=?",member.tenant,member.id) { obj("id" to it.getString(1),"name" to it.getString(2),"cardCode" to it.getString(3),"revision" to it.getLong(4)) },
        "balances" to c.rows("SELECT b.program_id,b.available,p.kind,v.config->>'name' AS name FROM balances b JOIN programs p ON p.tenant_id=b.tenant_id AND p.id=b.program_id JOIN program_versions v ON v.tenant_id=p.tenant_id AND v.program_id=p.id AND v.version=p.current_version WHERE b.tenant_id=? AND b.member_id=? ORDER BY b.program_id",member.tenant,member.id) { obj("programId" to it.getString(1),"available" to it.getLong(2),"kind" to it.getString(3),"name" to it.getString(4)) },
        "rewards" to rewards(c,member.tenant),
        "history" to c.rows("SELECT * FROM ledger WHERE tenant_id=? AND member_id=? ORDER BY created_at DESC,id DESC LIMIT 100",member.tenant,member.id) { obj("id" to it.getString("id"),"programId" to it.getString("program_id"),"delta" to it.getLong("delta"),"kind" to it.getString("kind"),"referenceId" to it.getString("reference_id"),"at" to it.instant("created_at")) },
        "redemptions" to c.rows("SELECT id,status,reward_name,expires_at FROM redemptions WHERE tenant_id=? AND member_id=? ORDER BY created_at DESC LIMIT 30",member.tenant,member.id) { obj("id" to it.getString(1),"status" to it.getString(2),"name" to it.getString(3),"expiresAt" to it.getTimestamp(4).toInstant()) }
    )
    fun reserve(member: Member, input: Reserve, key: String) = db.tx { c -> once(c,member.tenant,"reserve:${member.id}",key,json.encodeToString(input)) {
        commercial.requireActive(c, member.tenant);
        
        lockMember(c,member.tenant,member.id); releaseExpired(c,member.tenant,member.id)
        val reward = c.one("SELECT * FROM rewards WHERE tenant_id=? AND id=? AND active=true FOR SHARE",member.tenant,uuid(input.rewardId)) { obj("program" to it.getString("program_id"),"name" to it.getString("name"),"cost" to it.getLong("cost"),"version" to it.getInt("version")) } ?: throw Problem(404,"NOT_FOUND","Premio no disponible.")
        val program = reward.getValue("program").jsonPrimitive.content; val cost = reward.getValue("cost").jsonPrimitive.long
        val redeemId = id(); val token = Security.token(); val expires = now().plusSeconds(300)
        c.exec("INSERT INTO redemptions(tenant_id,id,member_id,program_id,reward_id,reward_version,reward_name,cost,token_hash,status,expires_at) VALUES(?,?,?,?,?,?,?,?,?,'RESERVED',?)",member.tenant,redeemId,member.id,program,input.rewardId,reward.getValue("version").jsonPrimitive.int,reward.getValue("name").jsonPrimitive.content,cost,Security.hash(token),
            Timestamp.from(expires))
        ledger(c,member.tenant,member.id,program,-cost,"RESERVE",redeemId)
        changed(c,member.tenant,member.id); audit(c,member.tenant,member.id,"RESERVE",redeemId)
        obj("id" to redeemId,"token" to token,"status" to "RESERVED","name" to reward.getValue("name"),"cost" to cost,"expiresAt" to expires)
    } }
        internal fun releaseExpired(c: Connection, tenant: String, member: String) {
        val holds = c.rows("SELECT id,program_id,cost FROM redemptions WHERE tenant_id=? AND member_id=? AND status='RESERVED' AND expires_at<=? FOR UPDATE",tenant,member,
            Timestamp.from(now())) { Triple(it.getString(1),it.getString(2),it.getLong(3)) }
        holds.forEach { (redemption,program,cost) ->
            ledger(c,tenant,member,program,cost,"RELEASE",redemption)
            c.exec("UPDATE redemptions SET status='EXPIRED' WHERE tenant_id=? AND id=?",tenant,redemption)
            audit(c,tenant,"expiry-worker","EXPIRE",redemption)
        }
        if (holds.isNotEmpty()) changed(c,tenant,member)
    }
    fun expireBatch(): Int {
        val members = db.tx { c -> c.rows("SELECT DISTINCT tenant_id,member_id FROM redemptions WHERE status='RESERVED' AND expires_at<=? LIMIT 200",
            Timestamp.from(now())) { Member(it.getString(1),it.getString(2)) } }
        members.forEach { member -> db.tx { c -> lockMember(c,member.tenant,member.id); releaseExpired(c,member.tenant,member.id) } }
        return members.size
    }
    fun cancel(member: Member, redemptionId: String, key: String) = db.tx { c -> once(c,member.tenant,"cancel:${member.id}",key,uuid(redemptionId)) {
        lockMember(c,member.tenant,member.id); releaseExpired(c,member.tenant,member.id)
        val hold = c.one("SELECT program_id,cost,status FROM redemptions WHERE tenant_id=? AND member_id=? AND id=? FOR UPDATE",member.tenant,member.id,redemptionId) { Triple(it.getString(1),it.getLong(2),it.getString(3)) } ?: throw Problem(404,"NOT_FOUND","Canje no encontrado.")
        need(hold.third != "CONSUMED","ALREADY_CONSUMED","El premio ya fue entregado.",409)
        if (hold.third == "RESERVED") {
            ledger(c,member.tenant,member.id,hold.first,hold.second,"RELEASE",redemptionId)
            c.exec("UPDATE redemptions SET status='CANCELLED' WHERE tenant_id=? AND id=?",member.tenant,redemptionId)
            changed(c,member.tenant,member.id); audit(c,member.tenant,member.id,"CANCEL",redemptionId)
        }
        obj("id" to redemptionId,"status" to if (hold.third == "RESERVED") "CANCELLED" else hold.third)
    } }
    fun confirm(s: Staff, input: Confirm, key: String): JsonObject { s.at(input.branchId); need(input.token.length in 32..128,"INVALID_TOKEN","Código inválido.")
        return db.tx { c -> once(c,s.tenant,"confirm:${s.id}",key,json.encodeToString(input)) {
        commercial.requireActive(c, s.tenant);
        
            branch(c,s.tenant,input.branchId)
            val member = c.one("SELECT member_id FROM redemptions WHERE tenant_id=? AND token_hash=?",s.tenant,Security.hash(input.token)) { it.getString(1) } ?: throw Problem(404,"NOT_FOUND","Código no encontrado.")
            lockMember(c,s.tenant,member)
            val hold = c.one("SELECT id,status,expires_at,reward_name FROM redemptions WHERE tenant_id=? AND token_hash=? FOR UPDATE",s.tenant,Security.hash(input.token)) { obj("id" to it.getString(1),"status" to it.getString(2),"expiresAt" to it.getTimestamp(3).toInstant(),"name" to it.getString(4)) }!!
            need(hold.getValue("status").jsonPrimitive.content == "RESERVED","ALREADY_PROCESSED","Este canje ya fue procesado. No entregues otro premio.",409)
            need(now() < Instant.parse(hold.getValue("expiresAt").jsonPrimitive.content),"REDEMPTION_EXPIRED","El código venció. Solicita uno nuevo al cliente.",409)
            val redemption = hold.getValue("id").jsonPrimitive.content
            c.exec("UPDATE redemptions SET status='CONSUMED',confirmed_branch_id=?,confirmed_actor_id=?,consumed_at=? WHERE tenant_id=? AND id=?",input.branchId,s.id,
                Timestamp.from(now()),s.tenant,redemption)
            changed(c,s.tenant,member); audit(c,s.tenant,s.id,"CONSUME",redemption)
            obj("id" to redemption,"status" to "CONSUMED","name" to hold.getValue("name"),"receipt" to redemption)
        } }
    }
}
